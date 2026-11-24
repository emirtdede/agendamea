import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EN_LEGAL_DOCUMENTS, TR_LEGAL_DOCUMENTS } from '../../src/i18n/core/legalDocs';

const require = createRequire(import.meta.url);
const mcpClients = require('../../shared/mcpClients.cjs');
const { createShortcutAndStartupManager } = require('../../electron/modules/shortcutManager.cjs');

test('MCP clients: ChatGPT Codex (TOML), OpenCode (mcp.agendamea), and Bionic (LM Studio) detect, install, preserve comments/sections, and uninstall cleanly', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-mcp-clients-'));
  const fakeAppData = path.join(tmpHome, 'AppData', 'Roaming');
  const fakeLocalAppData = path.join(tmpHome, 'AppData', 'Local');
  const fakeCliExe = path.join(tmpHome, 'ag.exe');
  fs.writeFileSync(fakeCliExe, 'stub', 'utf8');

  // Seed realistic existing configs for all three clients
  const codexDir = path.join(tmpHome, '.codex');
  fs.mkdirSync(codexDir, { recursive: true });
  const codexTomlPath = path.join(codexDir, 'config.toml');
  fs.writeFileSync(
    codexTomlPath,
    [
      '# User Codex config',
      '[features]',
      'web_search = true',
      '',
      '[mcp_servers.node_repl]',
      "command = 'C:\\Tools\\node_repl.exe'",
      'args = []',
      '',
    ].join('\n'),
    'utf8',
  );

  const openCodeDir = path.join(tmpHome, '.config', 'opencode');
  fs.mkdirSync(openCodeDir, { recursive: true });
  const openCodePath = path.join(openCodeDir, 'opencode.json');
  fs.writeFileSync(
    openCodePath,
    JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        mcp: {
          otherTool: { type: 'local', command: ['other', 'mcp'], enabled: true },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const bionicAppDir = path.join(tmpHome, '.lmstudio', 'apps', 'bionic');
  fs.mkdirSync(bionicAppDir, { recursive: true });

  const env = {
    USERPROFILE: tmpHome,
    APPDATA: fakeAppData,
    LOCALAPPDATA: fakeLocalAppData,
  };

  try {
    const initial = mcpClients.listMcpClients({ env });
    const ids = initial.map((c: { id: string }) => c.id);
    assert.ok(ids.includes('codex'), 'codex client must be registered');
    assert.ok(ids.includes('opencode'), 'opencode client must be registered');
    assert.ok(ids.includes('bionic'), 'bionic client must be registered');

    for (const id of ['codex', 'opencode', 'bionic']) {
      const item = initial.find((c: { id: string }) => c.id === id);
      assert.equal(item.detected, true, `${id} must be detected`);
      assert.equal(item.configured, false, `${id} should start unconfigured`);
    }

    // 1. Install ChatGPT Codex TOML (must preserve existing TOML comments & tables)
    const codexInstall = mcpClients.installMcpClient('codex', { env, cliExePath: fakeCliExe });
    assert.equal(codexInstall.ok, true);
    assert.ok(codexInstall.backupPath && fs.existsSync(codexInstall.backupPath));
    const codexRaw = fs.readFileSync(codexTomlPath, 'utf8');
    assert.ok(codexRaw.includes('# User Codex config'));
    assert.ok(codexRaw.includes('[mcp_servers.node_repl]'));
    assert.ok(codexRaw.includes('[mcp_servers.agendamea]'));
    assert.ok(codexRaw.includes(`command = '${fakeCliExe}'`));
    assert.ok(codexRaw.includes("args = ['mcp']"));

    // 2. Install OpenCode JSON (must use type: 'local' and command array under mcp.agendamea)
    const ocInstall = mcpClients.installMcpClient('opencode', { env, cliExePath: fakeCliExe });
    assert.equal(ocInstall.ok, true);
    const ocParsed = JSON.parse(fs.readFileSync(openCodePath, 'utf8'));
    assert.equal(ocParsed.$schema, 'https://opencode.ai/config.json');
    assert.ok(ocParsed.mcp.otherTool, 'existing OpenCode MCP server must be preserved');
    assert.deepEqual(ocParsed.mcp.agendamea, {
      type: 'local',
      command: [fakeCliExe, 'mcp'],
      enabled: true,
    });

    // 3. Install Bionic (LM Studio) mcp.json
    const bionicInstall = mcpClients.installMcpClient('bionic', { env, cliExePath: fakeCliExe });
    assert.equal(bionicInstall.ok, true);
    const bionicPath = path.join(tmpHome, '.lmstudio', 'mcp.json');
    const bionicParsed = JSON.parse(fs.readFileSync(bionicPath, 'utf8'));
    assert.deepEqual(bionicParsed.mcpServers.agendamea, {
      command: fakeCliExe,
      args: ['mcp'],
    });

    // All three must now report configured: true
    const afterInstall = mcpClients.listMcpClients({ env });
    for (const id of ['codex', 'opencode', 'bionic']) {
      const item = afterInstall.find((c: { id: string }) => c.id === id);
      assert.equal(item.configured, true, `${id} must be configured after install`);
      assert.equal(item.command, fakeCliExe);
      assert.equal(item.usesLegacyCmd, false);
    }

    // Uninstall all three cleanly and confirm existing data remains intact
    assert.equal(mcpClients.uninstallMcpClient('codex', { env }).removed, true);
    const codexAfter = fs.readFileSync(codexTomlPath, 'utf8');
    assert.ok(!codexAfter.includes('[mcp_servers.agendamea]'));
    assert.ok(codexAfter.includes('[mcp_servers.node_repl]'));

    assert.equal(mcpClients.uninstallMcpClient('opencode', { env }).removed, true);
    const ocAfter = JSON.parse(fs.readFileSync(openCodePath, 'utf8'));
    assert.equal(ocAfter.mcp.agendamea, undefined);
    assert.ok(ocAfter.mcp.otherTool);

    assert.equal(mcpClients.uninstallMcpClient('bionic', { env }).removed, true);
    const bionicAfter = JSON.parse(fs.readFileSync(bionicPath, 'utf8'));
    assert.equal(bionicAfter.mcpServers.agendamea, undefined);

    // 4. Zed (context_servers) & Gemini CLI (must not falsely detect via .gemini/antigravity alone)
    const zedDir = path.join(fakeAppData, 'Zed');
    fs.mkdirSync(zedDir, { recursive: true });
    fs.writeFileSync(
      path.join(zedDir, 'settings.json'),
      '// Zed settings\n{ "theme": "One Dark" }\n',
      'utf8',
    );
    fs.mkdirSync(path.join(tmpHome, '.gemini', 'antigravity'), { recursive: true });

    const withZedAndGemini = mcpClients.listMcpClients({ env });
    const zedClient = withZedAndGemini.find((c: { id: string }) => c.id === 'zed');
    const geminiClient = withZedAndGemini.find((c: { id: string }) => c.id === 'gemini-cli');
    assert.equal(zedClient.detected, true, 'Zed must be detected from AppData/Zed');
    assert.equal(
      geminiClient.detected,
      false,
      'Gemini CLI must not falsely detect Antigravity dir',
    );

    assert.equal(mcpClients.installMcpClient('zed', { env, cliExePath: fakeCliExe }).ok, true);
    const zedSettings = JSON.parse(fs.readFileSync(path.join(zedDir, 'settings.json'), 'utf8'));
    assert.equal(zedSettings.theme, 'One Dark');
    assert.deepEqual(zedSettings.context_servers.agendamea, { command: fakeCliExe, args: ['mcp'] });

    assert.equal(
      mcpClients.installMcpClient('gemini-cli', { env, cliExePath: fakeCliExe }).ok,
      true,
    );
    const geminiSettings = JSON.parse(
      fs.readFileSync(path.join(tmpHome, '.gemini', 'settings.json'), 'utf8'),
    );
    assert.deepEqual(geminiSettings.mcpServers.agendamea, { command: fakeCliExe, args: ['mcp'] });

    // 5. Custom MCP Config file installer (auto-detects JSON, OpenCode, Zed, TOML & rejects non-config ext)
    const customJsonPath = path.join(tmpHome, 'my-agent.json');
    fs.writeFileSync(customJsonPath, '{}', 'utf8');
    const customJsonRes = mcpClients.installCustomMcpConfig(customJsonPath, {
      cliExePath: fakeCliExe,
    });
    assert.equal(customJsonRes.ok, true);
    assert.equal(customJsonRes.rootKey, 'mcpServers');
    assert.deepEqual(JSON.parse(fs.readFileSync(customJsonPath, 'utf8')).mcpServers.agendamea, {
      command: fakeCliExe,
      args: ['mcp'],
    });

    const customTomlPath = path.join(tmpHome, 'custom.toml');
    fs.writeFileSync(customTomlPath, '[profile]\nname = "dev"\n', 'utf8');
    const customTomlRes = mcpClients.installCustomMcpConfig(customTomlPath, {
      cliExePath: fakeCliExe,
    });
    assert.equal(customTomlRes.ok, true);
    assert.equal(customTomlRes.format, 'toml');
    assert.ok(fs.readFileSync(customTomlPath, 'utf8').includes('[mcp_servers.agendamea]'));

    assert.throws(
      () =>
        mcpClients.installCustomMcpConfig(path.join(tmpHome, 'bad.exe'), {
          cliExePath: fakeCliExe,
        }),
      /\.json, \.jsonc, or \.toml/,
    );
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('Shortcut manager: safe Ctrl+Alt+D default, startup autoFallback on OS conflict, live re-probe, and 1-click auto-resolve', () => {
  const blocked = new Set(['CommandOrControl+Alt+Space', 'CommandOrControl+Alt+D']);
  const registered = new Map<string, () => void>();
  const mockGlobalShortcut = {
    register: (key: string, fn: () => void) => {
      if (blocked.has(key) || registered.has(key)) return false;
      registered.set(key, fn);
      return true;
    },
    unregister: (key: string) => {
      registered.delete(key);
    },
  };

  const mgr = createShortcutAndStartupManager({
    app: {},
    globalShortcut: mockGlobalShortcut,
    getMainWindow: () => null,
    getActivePort: () => 38721,
    showAndFocusMainWindow: () => {
      // No-op stub for unit test
    },
    ensureVoiceOverlayManager: () => ({ toggle: async () => ({ ok: true }) }),
  });

  // Startup autoFallback when legacy Ctrl+Alt+Space & Ctrl+Alt+D are blocked -> auto-picks CommandOrControl+Shift+Alt+D
  const res = mgr.syncVoiceDictationShortcut('CommandOrControl+Alt+Space', true, {
    autoFallback: true,
  });
  assert.equal(res.registered, true);
  assert.equal(res.shortcut, 'CommandOrControl+Shift+Alt+D');

  // Manual user choice of a blocked hotkey shows blocked (does NOT silently override)
  const manualBlocked = mgr.syncVoiceDictationShortcut('CommandOrControl+Alt+Space', true);
  assert.equal(manualBlocked.registered, false);
  assert.equal(manualBlocked.shortcut, 'CommandOrControl+Alt+Space');

  // 1-click autoResolveBlockedShortcuts picks the next free OS candidate
  const resolved = mgr.autoResolveBlockedShortcuts();
  assert.equal(resolved.ok, true);
  assert.equal(resolved.resolvedAny, true);
  assert.equal(resolved.voiceRegistered, true);
  assert.equal(resolved.voiceShortcut, 'CommandOrControl+Shift+Alt+D');

  // Live re-probe recovers automatically once the external app releases the hotkey
  const blockedAgain = mgr.syncVoiceDictationShortcut('CommandOrControl+Alt+Space', true);
  assert.equal(blockedAgain.registered, false);
  blocked.delete('CommandOrControl+Alt+Space');
  const recovered = mgr.getRegistrationStatus();
  assert.equal(recovered.voiceRegistered, true);
  assert.equal(recovered.voiceShortcut, 'CommandOrControl+Alt+Space');
});

test('Legal documents (TR & EN): complete v1.1.0 coverage for AI downloads, Webhooks, MCP clients, KVKK/GDPR rights, and Piper voice licenses', () => {
  for (const docs of [TR_LEGAL_DOCUMENTS, EN_LEGAL_DOCUMENTS]) {
    const privacyText = docs.privacy.sections.flatMap((s) => s.paragraphs).join(' ');
    assert.ok(
      privacyText.includes('Hugging Face'),
      'Privacy policy must disclose Hugging Face downloads',
    );
    assert.ok(
      privacyText.includes('Webhook'),
      'Privacy policy must disclose user-configured webhooks',
    );
    assert.ok(
      privacyText.includes('ChatGPT Codex'),
      'Privacy policy must reference Codex MCP client',
    );
    assert.ok(
      privacyText.includes('OpenCode'),
      'Privacy policy must reference OpenCode MCP client',
    );
    assert.ok(privacyText.includes('Bionic'), 'Privacy policy must reference Bionic MCP client');
    assert.ok(
      privacyText.includes('.agenc'),
      'Privacy policy must mention AES-256-GCM .agenc backups',
    );

    const termsText = docs.terms.sections.flatMap((s) => s.paragraphs).join(' ');
    assert.ok(
      termsText.includes('Whisper'),
      'Terms must include local AI/voice accuracy disclaimer',
    );

    const gdprText = docs.gdpr.sections.flatMap((s) => s.paragraphs).join(' ');
    assert.ok(gdprText.includes('127.0.0.1'), 'GDPR/KVKK notice must mention loopback isolation');
    assert.ok(gdprText.includes('6698'), 'GDPR/KVKK notice must cite KVKK Law 6698');

    const ossText = docs.opensource.sections.flatMap((s) => s.paragraphs).join(' ');
    assert.ok(ossText.includes('CC0-1.0'), 'OSS notice must attribute Piper CC0-1.0 voice packs');
    assert.ok(ossText.includes('Qwen3-Embedding'), 'OSS notice must attribute Qwen3-Embedding');
  }
});
