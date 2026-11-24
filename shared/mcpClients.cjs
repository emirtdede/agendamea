'use strict';

/**
 * Agendamea MCP Client Auto-Discovery, Safe Atomic Config Installer (JSON / JSONC / TOML) & Live Stdio Self-Test.
 * Supports Claude Desktop, Cursor, VS Code (native `servers` + `type: "stdio"`), Windsurf,
 * Claude Code CLI, Google Antigravity, ChatGPT Codex (TOML), OpenCode, Bionic (LM Studio),
 * Zed (`context_servers`), Gemini CLI, plus any user-selected custom `.json`/`.jsonc`/`.toml` config
 * on Windows without `.cmd` ENOENT hazards.
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
  const { home, appData, localAppData } = getEnvPaths(options.env);
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

  const openCodeDir = path.join(home, '.config', 'opencode');
  const openCodeJson = path.join(openCodeDir, 'opencode.json');
  const openCodeJsonc = path.join(openCodeDir, 'opencode.jsonc');
  const openCodePath =
    !fs.existsSync(openCodeJson) && fs.existsSync(openCodeJsonc) ? openCodeJsonc : openCodeJson;

  return [
    {
      id: 'claude-desktop',
      aliases: ['claude', 'claude-desktop'],
      name: 'Claude Desktop',
      configPath: path.join(appData, 'Claude', 'claude_desktop_config.json'),
      detectDirs: [path.join(appData, 'Claude')],
      format: 'json',
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
      format: 'json',
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
      format: 'json',
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
      format: 'json',
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
      format: 'json',
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
      format: 'json',
      rootKey: 'mcpServers',
      includeTypeStdio: false,
      requiresRestart: false,
    },
    {
      id: 'codex',
      aliases: ['codex', 'chatgpt-codex', 'openai-codex'],
      name: 'ChatGPT Codex',
      configPath: path.join(home, '.codex', 'config.toml'),
      detectDirs: [path.join(home, '.codex')],
      format: 'toml',
      rootKey: 'mcp_servers',
      includeTypeStdio: false,
      requiresRestart: false,
    },
    {
      id: 'opencode',
      aliases: ['opencode', 'open-code'],
      name: 'OpenCode',
      configPath: openCodePath,
      detectDirs: [openCodeDir, path.join(localAppData, 'Programs', 'ai.opencode.desktop')],
      format: 'opencode-json',
      rootKey: 'mcp',
      includeTypeStdio: false,
      requiresRestart: false,
    },
    {
      id: 'bionic',
      aliases: ['bionic', 'lmstudio', 'lm-studio'],
      name: 'Bionic (LM Studio)',
      configPath: path.join(home, '.lmstudio', 'mcp.json'),
      detectDirs: [
        path.join(home, '.lmstudio', 'apps', 'bionic'),
        path.join(appData, 'Bionic'),
        path.join(home, '.lmstudio'),
      ],
      format: 'json',
      rootKey: 'mcpServers',
      includeTypeStdio: false,
      requiresRestart: false,
    },
    {
      id: 'zed',
      aliases: ['zed', 'zed-editor'],
      name: 'Zed',
      configPath: path.join(appData, 'Zed', 'settings.json'),
      detectDirs: [path.join(appData, 'Zed'), path.join(localAppData, 'Programs', 'Zed')],
      format: 'json',
      rootKey: 'context_servers',
      includeTypeStdio: false,
      requiresRestart: false,
    },
    {
      id: 'gemini-cli',
      aliases: ['gemini', 'gemini-cli', 'geminicli'],
      name: 'Gemini CLI',
      configPath: path.join(home, '.gemini', 'settings.json'),
      detectDirs: [
        path.join(home, '.gemini', 'google_accounts.json'),
        path.join(home, '.gemini', 'oauth_creds.json'),
      ],
      format: 'json',
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

const CODEX_SECTION_RE =
  /^\s*\[\s*mcp_servers\.(?:agendamea|"agendamea"|'agendamea')(?:\.[^\]]+)?\s*\]\s*(?:#.*)?$/;
const CODEX_MAIN_SECTION_RE =
  /^\s*\[\s*mcp_servers\.(?:agendamea|"agendamea"|'agendamea')\s*\]\s*(?:#.*)?$/;
const TOML_HEADER_RE = /^\s*\[[^\]]+\]\s*(?:#.*)?$/;

function formatTomlString(value) {
  const str = String(value ?? '');
  if (!str.includes("'") && !/[\r\n]/.test(str)) {
    return `'${str}'`;
  }
  return JSON.stringify(str);
}

function parseTomlStringLiteral(rawVal) {
  const trimmed = String(rawVal || '').trim();
  if (trimmed.startsWith("'") && trimmed.length >= 2) {
    const endIdx = trimmed.indexOf("'", 1);
    if (endIdx > 0) return trimmed.slice(1, endIdx);
  }
  if (trimmed.startsWith('"') && trimmed.length >= 2) {
    let i = 1;
    let escaped = false;
    while (i < trimmed.length) {
      const ch = trimmed[i];
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        try {
          return JSON.parse(trimmed.slice(0, i + 1));
        } catch {
          return trimmed.slice(1, i);
        }
      }
      i += 1;
    }
  }
  return null;
}

function parseCodexTomlMcp(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, raw: '', configured: false, command: null, parseError: null };
  }
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);
  let inMain = false;
  let command = null;
  for (const line of lines) {
    if (TOML_HEADER_RE.test(line)) {
      inMain = CODEX_MAIN_SECTION_RE.test(line);
      continue;
    }
    if (!inMain) continue;
    const match = line.match(/^\s*command\s*=\s*(.+)$/);
    if (match) {
      command = parseTomlStringLiteral(match[1]);
      if (command) break;
    }
  }
  return {
    exists: true,
    raw,
    configured: Boolean(command),
    command,
    parseError: null,
  };
}

function stripCodexAgendameaSections(raw) {
  const lines = String(raw || '').split(/\r?\n/);
  const kept = [];
  let skipping = false;
  for (const line of lines) {
    if (TOML_HEADER_RE.test(line)) {
      skipping = CODEX_SECTION_RE.test(line);
      if (skipping) continue;
    }
    if (!skipping) kept.push(line);
  }
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function buildCodexTomlBlock(entry) {
  const argsList = (Array.isArray(entry.args) ? entry.args : [])
    .map((a) => formatTomlString(a))
    .join(', ');
  const lines = [
    '[mcp_servers.agendamea]',
    `command = ${formatTomlString(entry.command)}`,
    `args = [${argsList}]`,
  ];
  if (entry.env && typeof entry.env === 'object' && Object.keys(entry.env).length > 0) {
    lines.push('', '[mcp_servers.agendamea.env]');
    for (const [k, v] of Object.entries(entry.env)) {
      lines.push(`${k} = ${formatTomlString(v)}`);
    }
  }
  return lines.join('\n');
}

function buildOpenCodeServerEntry(entry) {
  const cmdArr = [entry.command, ...(Array.isArray(entry.args) ? entry.args : [])];
  const out = {
    type: 'local',
    command: cmdArr,
    enabled: true,
  };
  if (entry.env && typeof entry.env === 'object' && Object.keys(entry.env).length > 0) {
    out.environment = { ...entry.env };
  }
  return out;
}

function extractOpenCodeAgendameaCommand(mcpObj) {
  if (!mcpObj || typeof mcpObj !== 'object') return null;
  const direct = mcpObj.agendamea;
  const nested =
    mcpObj.servers && typeof mcpObj.servers === 'object' ? mcpObj.servers.agendamea : null;
  const candidate = direct || nested;
  if (!candidate || typeof candidate !== 'object') return null;
  if (Array.isArray(candidate.command) && typeof candidate.command[0] === 'string') {
    return candidate.command[0];
  }
  if (typeof candidate.command === 'string') {
    return candidate.command;
  }
  return null;
}

function listMcpClients(options = {}) {
  const registry = resolveClientRegistry(options);
  return registry.map((client) => {
    const detected =
      fs.existsSync(client.configPath) || client.detectDirs.some((d) => fs.existsSync(d));

    if (client.format === 'toml') {
      const parsed = parseCodexTomlMcp(client.configPath);
      const usesLegacyCmd = Boolean(
        parsed.configured && (parsed.command === 'ag' || /\.cmd$/i.test(String(parsed.command))),
      );
      return {
        id: client.id,
        name: client.name,
        configPath: client.configPath,
        rootKey: client.rootKey,
        detected,
        configExists: parsed.exists,
        configured: parsed.configured,
        usesLegacyCmd,
        parseError: parsed.parseError,
        requiresRestart: client.requiresRestart,
        command: parsed.command,
      };
    }

    const parsed = parseJsoncConfig(client.configPath);
    const serverMap =
      parsed.data && typeof parsed.data[client.rootKey] === 'object' && parsed.data[client.rootKey]
        ? parsed.data[client.rootKey]
        : null;

    let cmd = null;
    if (client.format === 'opencode-json') {
      cmd = extractOpenCodeAgendameaCommand(serverMap);
    } else {
      const entry = serverMap ? serverMap.agendamea || null : null;
      cmd =
        entry && typeof entry === 'object' && typeof entry.command === 'string'
          ? entry.command
          : null;
    }

    const configured = Boolean(cmd);
    const usesLegacyCmd = Boolean(configured && (cmd === 'ag' || /\.cmd$/i.test(String(cmd))));
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
      command: cmd,
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

  const baseEntry = buildDirectMcpServerEntry({
    ...options,
    includeTypeStdio: client.includeTypeStdio,
  });

  if (client.format === 'toml') {
    const parsed = parseCodexTomlMcp(client.configPath);
    fs.mkdirSync(path.dirname(client.configPath), { recursive: true });
    let backupPath = null;
    if (parsed.exists) {
      backupPath = `${client.configPath}.agendamea.bak.${Date.now()}`;
      fs.copyFileSync(client.configPath, backupPath);
    }
    const cleaned = stripCodexAgendameaSections(parsed.raw);
    const block = buildCodexTomlBlock(baseEntry);
    const nextToml = cleaned ? `${cleaned}\n\n${block}\n` : `${block}\n`;
    const tmpPath = `${client.configPath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpPath, nextToml, 'utf8');
    fs.renameSync(tmpPath, client.configPath);
    return {
      ok: true,
      clientId: client.id,
      name: client.name,
      configPath: client.configPath,
      backupPath,
      entry: baseEntry,
      requiresRestart: client.requiresRestart,
    };
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

  let writtenEntry = baseEntry;
  if (client.format === 'opencode-json') {
    if (!nextConfig.$schema) {
      nextConfig.$schema = 'https://opencode.ai/config.json';
    }
    writtenEntry = buildOpenCodeServerEntry(baseEntry);
    existingMap.agendamea = writtenEntry;
    if (
      existingMap.servers &&
      typeof existingMap.servers === 'object' &&
      !Array.isArray(existingMap.servers) &&
      Object.hasOwn(existingMap.servers, 'agendamea')
    ) {
      const cleanedServers = { ...existingMap.servers };
      delete cleanedServers.agendamea;
      existingMap.servers = cleanedServers;
    }
  } else {
    existingMap.agendamea = baseEntry;
  }

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
    entry: writtenEntry,
    requiresRestart: client.requiresRestart,
  };
}

function uninstallMcpClient(clientId, options = {}) {
  const client = findClientDef(clientId, options);
  if (!client) {
    throw new Error(`Unknown MCP client "${clientId}".`);
  }

  if (client.format === 'toml') {
    const parsed = parseCodexTomlMcp(client.configPath);
    if (!parsed.exists || !parsed.configured) {
      return { ok: true, clientId: client.id, removed: false, configPath: client.configPath };
    }
    const backupPath = `${client.configPath}.agendamea.bak.${Date.now()}`;
    fs.copyFileSync(client.configPath, backupPath);
    const cleaned = stripCodexAgendameaSections(parsed.raw);
    const tmpPath = `${client.configPath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpPath, cleaned ? `${cleaned}\n` : '', 'utf8');
    fs.renameSync(tmpPath, client.configPath);
    return {
      ok: true,
      clientId: client.id,
      removed: true,
      configPath: client.configPath,
      backupPath,
    };
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
  const hasDirect = Boolean(map && typeof map === 'object' && Object.hasOwn(map, 'agendamea'));
  const hasNestedOpenCode = Boolean(
    client.format === 'opencode-json' &&
      map &&
      typeof map === 'object' &&
      map.servers &&
      typeof map.servers === 'object' &&
      Object.hasOwn(map.servers, 'agendamea'),
  );
  if (!hasDirect && !hasNestedOpenCode) {
    return { ok: true, clientId: client.id, removed: false, configPath: client.configPath };
  }

  const backupPath = `${client.configPath}.agendamea.bak.${Date.now()}`;
  fs.copyFileSync(client.configPath, backupPath);

  const nextMap = { ...map };
  if (hasDirect) delete nextMap.agendamea;
  if (hasNestedOpenCode) {
    const nextServers = { ...nextMap.servers };
    delete nextServers.agendamea;
    nextMap.servers = nextServers;
  }
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

/**
 * Installs Agendamea into any user-selected `.json`, `.jsonc`, or `.toml` MCP configuration file.
 * Auto-detects format: TOML (`[mcp_servers.agendamea]`), OpenCode (`mcp.agendamea`),
 * Zed (`context_servers.agendamea`), VS Code (`servers.agendamea` + `type: "stdio"`),
 * or standard MCP JSON (`mcpServers.agendamea`). Always takes a `.bak` backup before modifying.
 */
function installCustomMcpConfig(targetPath, options = {}) {
  const cleanPath = String(targetPath || '').trim();
  if (!cleanPath) {
    throw new Error('Missing custom MCP config file path.');
  }
  const resolvedPath = path.resolve(cleanPath);
  const ext = path.extname(resolvedPath).toLowerCase();
  if (ext !== '.json' && ext !== '.jsonc' && ext !== '.toml') {
    throw new Error('Custom MCP config file must be .json, .jsonc, or .toml.');
  }

  const baseEntry = buildDirectMcpServerEntry({ ...options, includeTypeStdio: false });

  if (ext === '.toml') {
    const parsed = parseCodexTomlMcp(resolvedPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    let backupPath = null;
    if (parsed.exists) {
      backupPath = `${resolvedPath}.agendamea.bak.${Date.now()}`;
      fs.copyFileSync(resolvedPath, backupPath);
    }
    const cleaned = stripCodexAgendameaSections(parsed.raw);
    const block = buildCodexTomlBlock(baseEntry);
    const nextToml = cleaned ? `${cleaned}\n\n${block}\n` : `${block}\n`;
    const tmpPath = `${resolvedPath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpPath, nextToml, 'utf8');
    fs.renameSync(tmpPath, resolvedPath);
    return {
      ok: true,
      clientId: 'custom',
      name: path.basename(resolvedPath),
      configPath: resolvedPath,
      format: 'toml',
      rootKey: 'mcp_servers',
      backupPath,
      entry: baseEntry,
      requiresRestart: false,
    };
  }

  const parsed = parseJsoncConfig(resolvedPath);
  if (parsed.parseError || !parsed.data) {
    throw new Error(
      `Refusing to overwrite malformed config at ${resolvedPath}: ${parsed.parseError}`,
    );
  }

  const lowerPath = resolvedPath.toLowerCase();
  const baseName = path.basename(lowerPath);
  const data = parsed.data;
  const isOpenCode =
    baseName === 'opencode.json' ||
    baseName === 'opencode.jsonc' ||
    (typeof data.$schema === 'string' && data.$schema.includes('opencode.ai')) ||
    (Boolean(data.mcp) && typeof data.mcp === 'object' && !data.mcpServers);
  const isZed =
    !isOpenCode &&
    (Boolean(data.context_servers && typeof data.context_servers === 'object') ||
      (baseName === 'settings.json' && /[/\\]\.?zed[/\\]/i.test(resolvedPath)));
  const isVsCode =
    !isOpenCode &&
    !isZed &&
    ((Boolean(data.servers && typeof data.servers === 'object') && !data.mcpServers) ||
      /[/\\]code[/\\]user[/\\]mcp\.json$/i.test(resolvedPath));

  const format = isOpenCode ? 'opencode-json' : 'json';
  const rootKey = isOpenCode
    ? 'mcp'
    : isZed
      ? 'context_servers'
      : isVsCode
        ? 'servers'
        : 'mcpServers';

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  let backupPath = null;
  if (parsed.exists) {
    backupPath = `${resolvedPath}.agendamea.bak.${Date.now()}`;
    fs.copyFileSync(resolvedPath, backupPath);
  }

  const nextConfig = { ...data };
  const existingMap =
    nextConfig[rootKey] &&
    typeof nextConfig[rootKey] === 'object' &&
    !Array.isArray(nextConfig[rootKey])
      ? { ...nextConfig[rootKey] }
      : {};

  let writtenEntry = baseEntry;
  if (isOpenCode) {
    if (!nextConfig.$schema) {
      nextConfig.$schema = 'https://opencode.ai/config.json';
    }
    writtenEntry = buildOpenCodeServerEntry(baseEntry);
    existingMap.agendamea = writtenEntry;
  } else if (isVsCode) {
    writtenEntry = buildDirectMcpServerEntry({ ...options, includeTypeStdio: true });
    existingMap.agendamea = writtenEntry;
    if (!Array.isArray(nextConfig.inputs)) {
      nextConfig.inputs = [];
    }
  } else {
    existingMap.agendamea = baseEntry;
  }

  nextConfig[rootKey] = existingMap;
  const tmpPath = `${resolvedPath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, resolvedPath);

  return {
    ok: true,
    clientId: 'custom',
    name: path.basename(resolvedPath),
    configPath: resolvedPath,
    format,
    rootKey,
    backupPath,
    entry: writtenEntry,
    requiresRestart: false,
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
  installCustomMcpConfig,
  uninstallMcpClient,
  installAllDetectedMcpClients,
  probeMcpServer,
};
