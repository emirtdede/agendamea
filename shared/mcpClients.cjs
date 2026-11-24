'use strict';

/**
 * Agendamea MCP Client Auto-Discovery, Safe Atomic JSON Config Installer & Live Stdio Self-Test.
 * Supports Claude Desktop, Cursor, VS Code (native `servers` + `type: "stdio"`), Windsurf,
 * Claude Code CLI, and Google Antigravity on Windows without `.cmd` ENOENT hazards.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const cliInstaller = require('./cliInstaller.cjs');

function getEnvPaths(envOverrides = {}) {
  /** @type {Record<string, string | undefined>} */
  const env = { ...process.env, ...envOverrides };
  const home = env.USERPROFILE || os.homedir();
  const appData = env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const localAppData = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  return { home, appData, localAppData };
}

function resolveClientRegistry(options = {}) {
  const { home, appData } = getEnvPaths(options.env);
  const windsurfPrimary = path.join(appData, 'Windsurf', 'mcp.json');
  const windsurfLegacy = path.join(home, '.codeium', 'windsurf', 'mcp_config.json');
  const windsurfPath =
    !fs.existsSync(windsurfPrimary) && fs.existsSync(windsurfLegacy)
      ? windsurfLegacy
      : windsurfPrimary;

  const agyDir = path.join(home, '.gemini', 'antigravity');
  const agyPrimary = path.join(agyDir, 'mcp_config.json');
  const agyLegacy = path.join(home, '.gemini', 'config', 'mcp_config.json');
  const agyPath =
    fs.existsSync(agyPrimary) || fs.existsSync(agyDir) || !fs.existsSync(agyLegacy)
      ? agyPrimary
      : agyLegacy;

  return [
    {
      id: 'claude-desktop',
      aliases: ['claude', 'claude-desktop'],
      name: 'Claude Desktop',
      configPath: path.join(appData, 'Claude', 'claude_desktop_config.json'),
      detectDirs: [path.join(appData, 'Claude')],
      rootKey: 'mcpServers',
      includeTypeStdio: false,
      requiresRestart: true,
    },
    {
      id: 'cursor',
      aliases: ['cursor'],
      name: 'Cursor',
      configPath: path.join(home, '.cursor', 'mcp.json'),
      detectDirs: [path.join(home, '.cursor'), path.join(appData, 'Cursor')],
      rootKey: 'mcpServers',
      includeTypeStdio: false,
      requiresRestart: false,
    },
    {
      id: 'vscode',
      aliases: ['vscode', 'code', 'vs-code'],
      name: 'VS Code',
      configPath: path.join(appData, 'Code', 'User', 'mcp.json'),
      detectDirs: [path.join(appData, 'Code', 'User')],
      rootKey: 'servers',
      includeTypeStdio: true,
      requiresRestart: false,
    },
    {
      id: 'windsurf',
      aliases: ['windsurf'],
      name: 'Windsurf',
      configPath: windsurfPath,
      detectDirs: [path.join(appData, 'Windsurf'), path.join(home, '.codeium', 'windsurf')],
      rootKey: 'mcpServers',
      includeTypeStdio: false,
      requiresRestart: false,
    },
    {
      id: 'claude-code',
      aliases: ['claude-code', 'claudecode'],
      name: 'Claude Code',
      configPath: path.join(home, '.claude.json'),
      detectDirs: [path.join(home, '.claude')],
      rootKey: 'mcpServers',
      includeTypeStdio: false,
      requiresRestart: false,
    },
    {
      id: 'antigravity',
      aliases: ['antigravity', 'agy'],
      name: 'Antigravity',
      configPath: agyPath,
      detectDirs: [agyDir, path.join(home, '.gemini', 'config')],
      rootKey: 'mcpServers',
      includeTypeStdio: false,
      requiresRestart: false,
    },
  ];
}

/**
 * Strip line comments (`//`), block comments (`/* ... * /`), and trailing commas
 * safely outside string literals so VS Code / Cursor JSONC configs parse cleanly.
 */
function stripJsonc(raw) {
  let out = '';
  let inString = false;
  let escaped = false;
  let i = 0;
  const len = raw.length;

  while (i < len) {
    const ch = raw[i];
    const next = i + 1 < len ? raw[i + 1] : '';

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      i += 2;
      while (i < len && raw[i] !== '\n' && raw[i] !== '\r') i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i + 1 < len && !(raw[i] === '*' && raw[i + 1] === '/')) i += 1;
      i = Math.min(len, i + 2);
      continue;
    }

    out += ch;
    i += 1;
  }

  // Remove trailing commas before } or ] outside strings
  let cleaned = '';
  inString = false;
  escaped = false;
  for (let j = 0; j < out.length; j += 1) {
    const ch = out[j];
    if (inString) {
      cleaned += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      cleaned += ch;
      continue;
    }
    if (ch === ',') {
      let k = j + 1;
      while (k < out.length && /\s/.test(out[k])) k += 1;
      if (out[k] === '}' || out[k] === ']') {
        continue;
      }
    }
    cleaned += ch;
  }

  return cleaned.trim();
}

function parseJsoncConfig(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, data: {}, parseError: null };
  }
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  if (!raw.trim()) {
    return { exists: true, data: {}, parseError: null };
  }
  try {
    const parsed = JSON.parse(stripJsonc(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { exists: true, data: null, parseError: 'Config root must be a JSON object.' };
    }
    return { exists: true, data: parsed, parseError: null };
  } catch (err) {
    return {
      exists: true,
      data: null,
      parseError: err instanceof Error ? err.message : 'Invalid JSON syntax.',
    };
  }
}

/**
 * Always emits a direct native `.exe` command (NEVER `.cmd` which fails with ENOENT
 * under Windows `spawn(..., { shell: false })`).
 */
function buildDirectMcpServerEntry(options = {}) {
  const runtimeRoot = options.runtimeRoot
    ? path.resolve(options.runtimeRoot)
    : path.resolve(__dirname, '..');
  const mcpPath = options.mcpPath || path.join(runtimeRoot, 'mcp', 'server.cjs');
  const nativeShimExe =
    options.cliExePath !== undefined
      ? options.cliExePath
      : cliInstaller.getCliExecutablePath(options.binDir);

  let entry;
  if (nativeShimExe && fs.existsSync(nativeShimExe)) {
    entry = {
      command: nativeShimExe,
      args: ['mcp'],
    };
  } else {
    const execPath = options.execPath || process.execPath;
    const isNode = /^node(\.exe)?$/i.test(path.basename(execPath));
    entry = isNode
      ? { command: execPath, args: [mcpPath] }
      : {
          command: execPath,
          args: [mcpPath],
          env: { ELECTRON_RUN_AS_NODE: '1' },
        };
  }

  if (options.includeTypeStdio) {
    return { type: 'stdio', ...entry };
  }
  return entry;
}

function findClientDef(clientId, options = {}) {
  const clean = String(clientId || '')
    .trim()
    .toLowerCase();
  const registry = resolveClientRegistry(options);
  return registry.find((c) => c.id === clean || c.aliases.includes(clean)) || null;
}

function listMcpClients(options = {}) {
  const registry = resolveClientRegistry(options);
  return registry.map((client) => {
    const detected =
      fs.existsSync(client.configPath) || client.detectDirs.some((d) => fs.existsSync(d));
    const parsed = parseJsoncConfig(client.configPath);
    const serverMap =
      parsed.data && typeof parsed.data[client.rootKey] === 'object' && parsed.data[client.rootKey]
        ? parsed.data[client.rootKey]
        : null;
    const entry = serverMap ? serverMap.agendamea || null : null;
    const configured = Boolean(
      entry && typeof entry === 'object' && typeof entry.command === 'string',
    );
    const usesLegacyCmd = Boolean(
      configured && (entry.command === 'ag' || /\.cmd$/i.test(String(entry.command))),
    );
    return {
      id: client.id,
      name: client.name,
      configPath: client.configPath,
      rootKey: client.rootKey,
      detected,
      configExists: parsed.exists,
      configured,
      usesLegacyCmd,
      parseError: parsed.parseError,
      requiresRestart: client.requiresRestart,
      command: configured ? entry.command : null,
    };
  });
}

function installMcpClient(clientId, options = {}) {
  const client = findClientDef(clientId, options);
  if (!client) {
    const known = resolveClientRegistry(options)
      .map((c) => c.id)
      .join(', ');
    throw new Error(`Unknown MCP client "${clientId}". Supported: ${known}`);
  }

  const parsed = parseJsoncConfig(client.configPath);
  if (parsed.parseError || !parsed.data) {
    throw new Error(
      `Refusing to overwrite malformed config at ${client.configPath}: ${parsed.parseError}`,
    );
  }

  fs.mkdirSync(path.dirname(client.configPath), { recursive: true });

  let backupPath = null;
  if (parsed.exists) {
    backupPath = `${client.configPath}.agendamea.bak.${Date.now()}`;
    fs.copyFileSync(client.configPath, backupPath);
  }

  const nextConfig = { ...parsed.data };
  const existingMap =
    nextConfig[client.rootKey] &&
    typeof nextConfig[client.rootKey] === 'object' &&
    !Array.isArray(nextConfig[client.rootKey])
      ? { ...nextConfig[client.rootKey] }
      : {};

  const entry = buildDirectMcpServerEntry({
    ...options,
    includeTypeStdio: client.includeTypeStdio,
  });
  existingMap.agendamea = entry;
  nextConfig[client.rootKey] = existingMap;

  if (client.id === 'vscode' && !Array.isArray(nextConfig.inputs)) {
    nextConfig.inputs = [];
  }

  const tmpPath = `${client.configPath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, client.configPath);

  return {
    ok: true,
    clientId: client.id,
    name: client.name,
    configPath: client.configPath,
    backupPath,
    entry,
    requiresRestart: client.requiresRestart,
  };
}

function uninstallMcpClient(clientId, options = {}) {
  const client = findClientDef(clientId, options);
  if (!client) {
    throw new Error(`Unknown MCP client "${clientId}".`);
  }
  const parsed = parseJsoncConfig(client.configPath);
  if (!parsed.exists) {
    return { ok: true, clientId: client.id, removed: false, configPath: client.configPath };
  }
  if (parsed.parseError || !parsed.data) {
    throw new Error(
      `Refusing to modify malformed config at ${client.configPath}: ${parsed.parseError}`,
    );
  }
  const map = parsed.data[client.rootKey];
  if (!map || typeof map !== 'object' || !Object.hasOwn(map, 'agendamea')) {
    return { ok: true, clientId: client.id, removed: false, configPath: client.configPath };
  }

  const backupPath = `${client.configPath}.agendamea.bak.${Date.now()}`;
  fs.copyFileSync(client.configPath, backupPath);

  const nextMap = { ...map };
  delete nextMap.agendamea;
  const nextConfig = { ...parsed.data, [client.rootKey]: nextMap };
  const tmpPath = `${client.configPath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, client.configPath);

  return {
    ok: true,
    clientId: client.id,
    removed: true,
    configPath: client.configPath,
    backupPath,
  };
}

function installAllDetectedMcpClients(options = {}) {
  const clients = listMcpClients(options);
  const targets = options.includeUndetected ? clients : clients.filter((c) => c.detected);
  const results = [];
  for (const c of targets) {
    try {
      results.push(installMcpClient(c.id, options));
    } catch (err) {
      results.push({
        ok: false,
        clientId: c.id,
        name: c.name,
        configPath: c.configPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return {
    ok: results.length > 0 && results.every((r) => r.ok),
    installedCount: results.filter((r) => r.ok).length,
    results,
  };
}

/**
 * Live stdio self-test: spawns the exact MCP command with `shell: false` (mirroring Claude Desktop / Cursor / VS Code)
 * and executes a real JSON-RPC handshake (`initialize` -> `tools/list` -> `resources/list` -> `prompts/list` -> `agendamea_status`).
 */
function probeMcpServer(options = {}) {
  const entry = buildDirectMcpServerEntry(options);
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 8000;
  const startedAt = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (child && child.exitCode === null) child.kill();
      } catch {
        // Ignore
      }
      resolve({
        ...payload,
        latencyMs: Date.now() - startedAt,
        command: entry.command,
        args: entry.args,
      });
    };

    const env = {
      ...process.env,
      ...(entry.env || {}),
      ...(options.env || {}),
    };

    let child;
    try {
      child = spawn(entry.command, entry.args, {
        shell: false,
        windowsHide: true,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      finish({ ok: false, error: err instanceof Error ? err.message : String(err) });
      return;
    }

    const timer = setTimeout(() => {
      finish({ ok: false, error: `MCP server probe timed out after ${timeoutMs}ms.` });
    }, timeoutMs);

    let stdoutBuf = '';
    let stderrBuf = '';
    const responses = new Map();

    child.on('error', (err) => {
      finish({ ok: false, error: `Spawn failed (${err.code || 'ERR'}): ${err.message}` });
    });

    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf8');
    });

    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString('utf8');
      const lines = stdoutBuf.split(/\r?\n/);
      stdoutBuf = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (msg && msg.id !== undefined) {
            responses.set(msg.id, msg);
          }
        } catch {
          // Ignore non-JSON line
        }
      }

      if (
        responses.has(1) &&
        responses.has(2) &&
        responses.has(3) &&
        responses.has(4) &&
        responses.has(5)
      ) {
        const initRes = responses.get(1)?.result;
        const toolsRes = responses.get(2)?.result;
        const resourcesRes = responses.get(3)?.result;
        const promptsRes = responses.get(4)?.result;
        const statusCall = responses.get(5)?.result;
        let statusData = null;
        try {
          statusData =
            statusCall?.structuredContent || JSON.parse(statusCall?.content?.[0]?.text || 'null');
        } catch {
          statusData = null;
        }
        finish({
          ok: Boolean(initRes?.protocolVersion && Array.isArray(toolsRes?.tools)),
          protocolVersion: initRes?.protocolVersion || '',
          serverVersion: initRes?.serverInfo?.version || '',
          toolCount: Array.isArray(toolsRes?.tools) ? toolsRes.tools.length : 0,
          resourceCount: Array.isArray(resourcesRes?.resources) ? resourcesRes.resources.length : 0,
          promptCount: Array.isArray(promptsRes?.prompts) ? promptsRes.prompts.length : 0,
          mode: statusData?.mode || 'unknown',
          activeTasks: typeof statusData?.activeTasks === 'number' ? statusData.activeTasks : null,
          error: statusCall?.isError ? statusCall?.content?.[0]?.text : undefined,
        });
      }
    });

    child.on('exit', (code) => {
      if (!settled) {
        finish({
          ok: false,
          error: `MCP server exited early (code ${code})${stderrBuf.trim() ? `: ${stderrBuf.trim().slice(0, 240)}` : ''}`,
        });
      }
    });

    const frames = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'agendamea-probe', version: '1.0.0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 3, method: 'resources/list', params: {} },
      { jsonrpc: '2.0', id: 4, method: 'prompts/list', params: {} },
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'agendamea_status', arguments: {} },
      },
    ];
    try {
      for (const frame of frames) {
        child.stdin.write(`${JSON.stringify(frame)}\n`);
      }
      child.stdin.end();
    } catch (err) {
      finish({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

module.exports = {
  resolveClientRegistry,
  stripJsonc,
  buildDirectMcpServerEntry,
  listMcpClients,
  installMcpClient,
  uninstallMcpClient,
  installAllDetectedMcpClients,
  probeMcpServer,
};
