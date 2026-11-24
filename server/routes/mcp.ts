import crypto from 'node:crypto';
import mcpServerMod from '../../mcp/server.cjs';
import { isLoopbackAddress, timingSafeCompareStrings } from '../middleware/security.ts';
import { createComponentLogger } from '../services/logger.ts';
import { createMcpInProcessStore } from '../services/mcpInProcessStore.ts';
import type { ServerContext } from '../types.ts';

const mcpLog = createComponentLogger('mcp-http');

const MAX_MCP_SESSIONS = 128;
const MAX_MCP_BATCH = 50;

export function registerMcpRoutes(ctx: ServerContext): void {
  const { app, db } = ctx;
  const inProcessStore = createMcpInProcessStore(ctx);
  const mcpHandler = mcpServerMod.createMcpHandler({ store: inProcessStore });

  const mcpHttpSessions = new Map<
    string,
    {
      protocolVersion: string;
      subscribedUris: Set<string>;
      lastSeenAt: number;
      isRemoteHttp?: boolean;
    }
  >();

  app.get('/api/mcp', (_req, res) => {
    res.setHeader('Allow', 'POST, DELETE');
    res.status(405).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: 'Method Not Allowed. Use POST for JSON-RPC requests.' },
    });
  });

  const authorizeRemoteMcpRequest = (
    req: Parameters<Parameters<typeof app.post>[1]>[0],
    res: Parameters<Parameters<typeof app.post>[1]>[1],
  ): boolean => {
    if (isLoopbackAddress(req.socket.remoteAddress)) return true;
    const settings = db.getSettings();
    const configuredSecret = (
      settings.webhookIncomingSecret ??
      settings.webhookSecret ??
      ''
    ).trim();
    const authHeader = String(req.headers.authorization || '').trim();
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const providedSecret = bearerToken || String(req.headers['x-agendamea-secret'] || '').trim();
    if (!configuredSecret || !timingSafeCompareStrings(providedSecret, configuredSecret)) {
      res.status(401).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32001, message: 'Unauthorized remote MCP HTTP request.' },
      });
      return false;
    }
    return true;
  };

  app.post('/api/mcp', async (req, res) => {
    try {
      const isLocalCaller = isLoopbackAddress(req.socket.remoteAddress);
      if (!authorizeRemoteMcpRequest(req, res)) {
        return;
      }

      const now = Date.now();
      for (const [sid, state] of mcpHttpSessions.entries()) {
        if (now - state.lastSeenAt > 2 * 60 * 60 * 1000) mcpHttpSessions.delete(sid);
      }

      let sessionId = String(req.headers['mcp-session-id'] || '').trim();
      let sessionState = sessionId ? mcpHttpSessions.get(sessionId) : undefined;
      if (!sessionState) {
        if (mcpHttpSessions.size >= MAX_MCP_SESSIONS) {
          const oldestKey = mcpHttpSessions.keys().next().value;
          if (oldestKey) mcpHttpSessions.delete(oldestKey);
        }
        sessionId = sessionId || `mcp_${crypto.randomUUID().replace(/-/g, '')}`;
        const headerVer = String(req.headers['mcp-protocol-version'] || '').trim();
        sessionState = {
          protocolVersion: mcpServerMod.negotiateProtocolVersion(headerVer || '2025-11-25'),
          subscribedUris: new Set<string>(),
          lastSeenAt: now,
          isRemoteHttp: !isLocalCaller,
        };
        mcpHttpSessions.set(sessionId, sessionState);
      } else {
        sessionState.lastSeenAt = now;
        sessionState.isRemoteHttp = !isLocalCaller;
      }

      const payload = req.body;
      const isBatch = Array.isArray(payload);
      if (isBatch && payload.length > MAX_MCP_BATCH) {
        res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: `Batch limit exceeded (max ${MAX_MCP_BATCH}).` },
        });
        return;
      }
      const messages = isBatch ? payload : [payload];
      const responses: unknown[] = [];

      for (const msg of messages) {
        const { response } = await mcpHandler.handleJsonRpcRequest(msg, sessionState);
        if (response) responses.push(response);
      }

      res.setHeader('MCP-Protocol-Version', sessionState.protocolVersion);
      res.setHeader('Mcp-Session-Id', sessionId);

      if (responses.length === 0) {
        res.status(202).end();
        return;
      }
      res.status(200).json(isBatch ? responses : responses[0]);
    } catch (err) {
      mcpLog.error({ err }, 'POST /api/mcp error');
      res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: 'MCP HTTP internal error.' },
      });
    }
  });

  app.delete('/api/mcp', (req, res) => {
    if (!authorizeRemoteMcpRequest(req, res)) {
      return;
    }
    const sessionId = String(req.headers['mcp-session-id'] || '').trim();
    if (sessionId) mcpHttpSessions.delete(sessionId);
    res.status(204).end();
  });
}
