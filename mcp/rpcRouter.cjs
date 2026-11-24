'use strict';

const store = require('../shared/localStore.cjs');
const { getAppLogger } = require('../shared/logger.cjs');
const { TOOLS, STATIC_RESOURCES, RESOURCE_TEMPLATES, PROMPTS } = require('./toolSchemas.cjs');
const { readResource, getPrompt } = require('./resources.cjs');
const { executeTool } = require('./toolExecutor.cjs');

const mcpLog = () => getAppLogger('mcp');

const SERVER_NAME = 'agendamea';
const SERVER_VERSION = store.APP_VERSION;
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const DEFAULT_PROTOCOL_VERSION = '2025-11-25';

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

function negotiateProtocolVersion(clientVersion) {
  const forced = String(process.env.AGENDAMEA_MCP_COMPAT || '').trim();
  if (forced && SUPPORTED_PROTOCOL_VERSIONS.includes(forced)) {
    return forced;
  }
  const reqVer = String(clientVersion || '').trim();
  if (SUPPORTED_PROTOCOL_VERSIONS.includes(reqVer)) {
    return reqVer;
  }
  return DEFAULT_PROTOCOL_VERSION;
}

function supportsStructuredOutput(protocolVersion) {
  return protocolVersion >= '2025-06-18';
}

function toStructuredObject(result) {
  if (Array.isArray(result)) {
    return { items: result, count: result.length };
  }
  if (result && typeof result === 'object') {
    return result;
  }
  return { value: result };
}

async function handleJsonRpcRequest(msg, sessionState = {}) {
  if (!msg || typeof msg !== 'object') {
    return {
      response: {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid Request' },
      },
      notifications: [],
    };
  }
  const activeStore = sessionState?.store || store;
  const { id, method, params } = msg;
  if (!sessionState.protocolVersion) {
    sessionState.protocolVersion = negotiateProtocolVersion(DEFAULT_PROTOCOL_VERSION);
  }
  if (!sessionState.subscribedUris) {
    sessionState.subscribedUris = new Set();
  }

  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return { response: null, notifications: [] };
  }

  try {
    if (method === 'initialize') {
      sessionState.protocolVersion = negotiateProtocolVersion(params?.protocolVersion);
      return {
        response: {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: sessionState.protocolVersion,
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: true, listChanged: false },
              prompts: { listChanged: false },
            },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          },
        },
        notifications: [],
      };
    }

    if (method === 'ping') {
      return { response: { jsonrpc: '2.0', id, result: {} }, notifications: [] };
    }

    if (method === 'tools/list') {
      const includeOutputSchema = supportsStructuredOutput(sessionState.protocolVersion);
      const tools = includeOutputSchema
        ? TOOLS
        : TOOLS.map(({ outputSchema: _omit, ...rest }) => rest);
      return {
        response: { jsonrpc: '2.0', id, result: { tools } },
        notifications: [],
      };
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      try {
        const result = await executeTool(toolName, params?.arguments, activeStore);
        /** @type {Record<string, any>} */
        const responsePayload = {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
        if (supportsStructuredOutput(sessionState.protocolVersion)) {
          responsePayload.structuredContent = toStructuredObject(result);
        }
        const notifications = [];
        const toolMeta = TOOL_BY_NAME.get(toolName);
        if (
          toolMeta?.annotations &&
          toolMeta.annotations.readOnlyHint === false &&
          sessionState.subscribedUris.size > 0
        ) {
          for (const uri of sessionState.subscribedUris) {
            notifications.push({
              jsonrpc: '2.0',
              method: 'notifications/resources/updated',
              params: { uri },
            });
          }
        }
        return {
          response: { jsonrpc: '2.0', id, result: responsePayload },
          notifications,
        };
      } catch (err) {
        const isRemote = Boolean(sessionState?.isRemoteHttp);
        if (isRemote) {
          mcpLog().error({ toolName, err }, 'MCP tool execution failed');
        }
        const safeText = isRemote
          ? 'Tool execution failed.'
          : err instanceof Error
            ? err.message
            : String(err);
        return {
          response: {
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [{ type: 'text', text: safeText }],
            },
          },
          notifications: [],
        };
      }
    }

    if (method === 'resources/list') {
      return {
        response: { jsonrpc: '2.0', id, result: { resources: STATIC_RESOURCES } },
        notifications: [],
      };
    }

    if (method === 'resources/templates/list') {
      return {
        response: { jsonrpc: '2.0', id, result: { resourceTemplates: RESOURCE_TEMPLATES } },
        notifications: [],
      };
    }

    if (method === 'resources/read') {
      const content = await readResource(params?.uri, activeStore);
      return {
        response: { jsonrpc: '2.0', id, result: { contents: [content] } },
        notifications: [],
      };
    }

    if (method === 'resources/subscribe') {
      const uri = String(params?.uri || '').trim();
      if (!uri) {
        return {
          response: {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing resource uri' },
          },
          notifications: [],
        };
      }
      sessionState.subscribedUris.add(uri);
      return { response: { jsonrpc: '2.0', id, result: {} }, notifications: [] };
    }

    if (method === 'resources/unsubscribe') {
      const uri = String(params?.uri || '').trim();
      if (uri) sessionState.subscribedUris.delete(uri);
      return { response: { jsonrpc: '2.0', id, result: {} }, notifications: [] };
    }

    if (method === 'prompts/list') {
      return {
        response: { jsonrpc: '2.0', id, result: { prompts: PROMPTS } },
        notifications: [],
      };
    }

    if (method === 'prompts/get') {
      const promptResult = await getPrompt(params?.name, params?.arguments, activeStore);
      return {
        response: { jsonrpc: '2.0', id, result: promptResult },
        notifications: [],
      };
    }

    if (id !== undefined) {
      return {
        response: {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        },
        notifications: [],
      };
    }
    return { response: null, notifications: [] };
  } catch (err) {
    if (id !== undefined) {
      const hasExplicitCode = typeof err?.rpcCode === 'number';
      const code = hasExplicitCode ? err.rpcCode : -32603;
      const isRemote = Boolean(sessionState?.isRemoteHttp);
      if (isRemote && !hasExplicitCode) {
        mcpLog().error({ method, err }, 'MCP internal RPC error');
      }
      const message =
        isRemote && !hasExplicitCode
          ? 'Internal error'
          : err instanceof Error
            ? err.message
            : 'Internal error';
      return {
        response: {
          jsonrpc: '2.0',
          id,
          error: { code, message },
        },
        notifications: [],
      };
    }
    return { response: null, notifications: [] };
  }
}

function createMcpHandler(options = {}) {
  const injectedStore = options.store || store;
  return {
    executeTool: (name, args) => executeTool(name, args, injectedStore),
    readResource: (uri) => readResource(uri, injectedStore),
    getPrompt: (name, args) => getPrompt(name, args, injectedStore),
    handleJsonRpcRequest: (msg, sessionState = {}) =>
      handleJsonRpcRequest(msg, { ...sessionState, store: sessionState.store || injectedStore }),
  };
}

module.exports = {
  SUPPORTED_PROTOCOL_VERSIONS,
  DEFAULT_PROTOCOL_VERSION,
  negotiateProtocolVersion,
  supportsStructuredOutput,
  toStructuredObject,
  handleJsonRpcRequest,
  createMcpHandler,
};
