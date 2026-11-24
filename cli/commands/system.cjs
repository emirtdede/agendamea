'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const store = require('../../shared/localStore.cjs');
const { getCliMessages } = require('../../shared/cliMessages.cjs');
const {
  QUIET_MODE,
  CONFIG_SCHEMA,
  ALL_TOP_COMMANDS,
  c,
  hasAnyFlag,
  getOptionValue,
  stripOptions,
  getCommandHelp,
  parseSettingValue,
} = require('../lib/cliHelpers.cjs');

async function handleMcpCommand(args, asJson) {
  const mcpSub = String(args[1] || '').toLowerCase();
  if (mcpSub === '--help' || mcpSub === '-h' || mcpSub === 'help') {
    const langHelp = await store.getPreferredLanguage();
    console.log(getCommandHelp('mcp', langHelp, getCliMessages(langHelp)));
    return;
  }
  if (!mcpSub || mcpSub === 'serve' || mcpSub === 'stdio' || mcpSub === '--stdio') {
    console.log = (...a) => console.error(...a);
    require('../../mcp/server.cjs').startMcpServer();
    return;
  }
  const mcpClients = require('../../shared/mcpClients.cjs');
  const langMcp = await store.getPreferredLanguage();
  const cliMsg = getCliMessages(langMcp);

  if (mcpSub === 'list' || mcpSub === 'status' || mcpSub === 'durum') {
    const clients = mcpClients.listMcpClients();
    if (asJson) {
      console.log(JSON.stringify(clients, null, 2));
      return;
    }
    console.log(c.bold(cliMsg.mcpClientsTitle));
    for (const cl of clients) {
      const badge = cl.configured
        ? cl.usesLegacyCmd
          ? c.yellow('[LEGACY-CMD]')
          : c.green('[OK]')
        : cl.detected
          ? c.cyan('[READY]')
          : c.dim('[--]');
      console.log(`  ${badge} ${c.bold(cl.name)} (${cl.id}) ${c.dim(cl.configPath)}`);
    }
    return;
  }

  if (mcpSub === 'install' || mcpSub === 'kur') {
    const installAll = hasAnyFlag(args.slice(2), ['--all', '-a']);
    const targetClient = stripOptions(args.slice(2))[0];
    if (!installAll && !targetClient) {
      console.error(
        `${cliMsg.usagePrefix}: ag mcp install <claude|cursor|vscode|windsurf|claude-code|antigravity|--all>`,
      );
      process.exit(2);
    }
    const res = installAll
      ? mcpClients.installAllDetectedMcpClients({
          includeUndetected: hasAnyFlag(args.slice(2), ['--force']),
        })
      : mcpClients.installMcpClient(targetClient);
    if (asJson) {
      console.log(JSON.stringify(res, null, 2));
    } else if (installAll) {
      console.log(`${c.green(cliMsg.mcpInstalledOk)}: ${res.installedCount} ${cliMsg.clientsUnit}`);
      for (const r of res.results) {
        console.log(
          `  ${r.ok ? c.green('OK') : c.red('ERR')} ${r.name || r.clientId}: ${r.ok ? r.configPath : r.error}`,
        );
      }
    } else {
      console.log(`${c.green(cliMsg.mcpInstalledOk)}: ${c.bold(res.name)} -> ${res.configPath}`);
    }
    return;
  }

  if (mcpSub === 'uninstall' || mcpSub === 'remove' || mcpSub === 'kaldir' || mcpSub === 'kaldır') {
    const targetClient = stripOptions(args.slice(2))[0];
    if (!targetClient) {
      console.error(
        `${cliMsg.usagePrefix}: ag mcp uninstall <claude|cursor|vscode|windsurf|claude-code|antigravity>`,
      );
      process.exit(2);
    }
    const res = mcpClients.uninstallMcpClient(targetClient);
    if (asJson) console.log(JSON.stringify(res, null, 2));
    else console.log(`${c.yellow(cliMsg.mcpRemovedOk)}: ${targetClient} (${res.configPath})`);
    return;
  }

  if (mcpSub === 'doctor' || mcpSub === 'test') {
    const probe = await mcpClients.probeMcpServer();
    const clients = mcpClients.listMcpClients();
    if (asJson) {
      console.log(JSON.stringify({ probe, clients }, null, 2));
    } else {
      console.log(c.bold(cliMsg.mcpProbeTitle));
      if (probe.ok) {
        console.log(
          `  ${c.green('OK')} ${cliMsg.mcpProbeOk} (${probe.protocolVersion}, ${probe.toolCount} tools, ${probe.resourceCount} resources, ${probe.promptCount} prompts, ${probe.latencyMs}ms, mode=${probe.mode})`,
        );
      } else {
        console.error(`  ${c.red('ERR')} ${cliMsg.mcpProbeFail}: ${probe.error}`);
      }
    }
    if (!probe.ok) process.exit(1);
    return;
  }

  console.error(
    `Unknown mcp subcommand "${mcpSub}". Use: ag mcp [list|install <client|--all>|uninstall <client>|doctor]`,
  );
  process.exit(2);
}

async function handleDynamicComplete(args) {
  const word = String(args[1] || '').toLowerCase();
  const prev = String(args[2] || '').toLowerCase();
  let candidates = [];
  if (prev === 'config' || prev === 'ayar' || prev === 'settings') {
    candidates = CONFIG_SCHEMA.map((k) => k.key);
  } else if (prev === 'mcp') {
    candidates = ['list', 'install', 'uninstall', 'doctor', 'test'];
  } else if (prev === 'install' || prev === 'uninstall') {
    candidates = [
      'claude-desktop',
      'cursor',
      'vscode',
      'windsurf',
      'claude-code',
      'antigravity',
      '--all',
    ];
  } else if (prev === 'hook' || prev === 'webhook') {
    candidates = ['set', 'events', 'logs', 'outbox', 'replay', 'test', 'on', 'off'];
  } else if (prev === 'ai') {
    candidates = ['status', 'models', 'download', 'delete'];
  } else if (prev === 'completion') {
    candidates = ['powershell', 'bash', 'zsh'];
  } else if (word.startsWith('c:') || word.startsWith('/')) {
    const prefix = word.startsWith('c:') ? 'c:' : '/';
    try {
      const cats = await store.listCategories();
      candidates = cats.map(
        (cat) => `${prefix}${/\s/.test(cat.name) ? `"${cat.name}"` : cat.name}`,
      );
    } catch {
      candidates = [];
    }
  } else if (word.startsWith('--')) {
    candidates = [
      '--json',
      '--title',
      '--note',
      '--due',
      '--start',
      '--time',
      '--priority',
      '--cat',
      '--tag',
      '--pin',
      '--important',
      '--yes',
      '--list',
    ];
  } else {
    candidates = ALL_TOP_COMMANDS;
  }
  const filtered = candidates.filter((cand) => cand.toLowerCase().startsWith(word));
  for (const item of filtered) console.log(item);
}

function handleCompletionCommand(args, asJson, cliMsg) {
  const shellName = String(args[1] || 'powershell').toLowerCase();
  const installFlag = hasAnyFlag(args.slice(1), ['--install', '-i']);
  const profileOverride = getOptionValue(args.slice(1), ['--profile']);

  const psScript = [
    '# >>> agendamea completion >>>',
    "Register-ArgumentCompleter -Native -CommandName @('ag','agenda','agendamea') -ScriptBlock {",
    '  param($wordToComplete, $commandAst, $cursorPosition)',
    '  $elements = $commandAst.CommandElements',
    "  $prev = if ($elements.Count -ge 2) { $elements[$elements.Count - 2].Extent.Text } else { '' }",
    '  $items = & ag __complete $wordToComplete $prev 2>$null',
    '  foreach ($item in $items) {',
    "    [System.Management.Automation.CompletionResult]::new($item, $item, 'ParameterValue', $item)",
    '  }',
    '}',
    '# <<< agendamea completion <<<',
  ].join('\n');

  const bashScript = [
    '# >>> agendamea completion >>>',
    '_agendamea_complete() {',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal bash completion parameter expansion
    '  local cur="${COMP_WORDS[COMP_CWORD]}"',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal bash completion parameter expansion
    '  local prev="${COMP_WORDS[COMP_CWORD-1]}"',
    '  COMPREPLY=( $(compgen -W "$(ag __complete "$cur" "$prev" 2>/dev/null)" -- "$cur") )',
    '}',
    'complete -F _agendamea_complete ag agenda agendamea',
    '# <<< agendamea completion <<<',
  ].join('\n');

  const zshScript = [
    '# >>> agendamea completion >>>',
    '_agendamea_complete() {',
    '  local -a items',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal zsh completion parameter expansion
    '  items=(${(f)"$(ag __complete "${words[CURRENT]}" "${words[CURRENT-1]}" 2>/dev/null)"})',
    '  compadd -a items',
    '}',
    'compdef _agendamea_complete ag agenda agendamea',
    '# <<< agendamea completion <<<',
  ].join('\n');

  const chosen = shellName === 'bash' ? bashScript : shellName === 'zsh' ? zshScript : psScript;
  if (!installFlag) {
    console.log(chosen);
    return;
  }

  let restrictedPolicy = false;
  if (shellName === 'powershell' && process.platform === 'win32' && !profileOverride) {
    try {
      const pol = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', 'Get-ExecutionPolicy'],
        { encoding: 'utf8', windowsHide: true },
      ).trim();
      if (/^restricted$/i.test(pol)) restrictedPolicy = true;
    } catch {
      // Ignore policy probe errors
    }
  }
  if (restrictedPolicy) {
    if (asJson) {
      console.log(
        JSON.stringify(
          { ok: false, restrictedPolicy: true, warning: cliMsg.completionRestrictedWarn },
          null,
          2,
        ),
      );
    } else {
      console.error(c.yellow(cliMsg.completionRestrictedWarn));
      console.log(c.dim('ag completion powershell | Invoke-Expression'));
    }
    process.exit(2);
  }

  const targetProfiles = profileOverride
    ? [path.resolve(profileOverride)]
    : shellName === 'bash'
      ? [path.join(os.homedir(), '.bashrc')]
      : shellName === 'zsh'
        ? [path.join(os.homedir(), '.zshrc')]
        : process.platform === 'win32'
          ? [
              path.join(
                os.homedir(),
                'Documents',
                'WindowsPowerShell',
                'Microsoft.PowerShell_profile.ps1',
              ),
              path.join(
                os.homedir(),
                'Documents',
                'PowerShell',
                'Microsoft.PowerShell_profile.ps1',
              ),
            ]
          : [path.join(os.homedir(), '.config', 'powershell', 'Microsoft.PowerShell_profile.ps1')];

  const markerRe = /# >>> agendamea completion >>>[\s\S]*?# <<< agendamea completion <<</;
  for (const targetProfile of targetProfiles) {
    fs.mkdirSync(path.dirname(targetProfile), { recursive: true });
    const existing = fs.existsSync(targetProfile) ? fs.readFileSync(targetProfile, 'utf8') : '';
    const nextContent = markerRe.test(existing)
      ? existing.replace(markerRe, chosen)
      : `${existing.trimEnd()}${existing.trim() ? '\n\n' : ''}${chosen}\n`;
    fs.writeFileSync(targetProfile, nextContent, 'utf8');
  }
  if (asJson) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          shell: shellName,
          profilePath: targetProfiles[0],
          profilePaths: targetProfiles,
        },
        null,
        2,
      ),
    );
  } else if (!QUIET_MODE) {
    for (const p of targetProfiles) {
      console.log(`${c.green(cliMsg.completionInstalled)}: ${p}`);
    }
  }
}

async function handleDoctorCommand(asJson, cliMsg) {
  const cliInstaller = require('../../shared/cliInstaller.cjs');
  const mcpClients = require('../../shared/mcpClients.cjs');
  const [rawStatus, rawSrvStatus, outbox] = await Promise.all([
    store.getStatus().catch((e) => ({ error: e.message })),
    store.getHeadlessServerStatus().catch((e) => ({ running: false, error: e.message })),
    store.getWebhookOutbox(50).catch(() => []),
  ]);
  /** @type {any} */
  const status = rawStatus;
  /** @type {any} */
  const srvStatus = rawSrvStatus;
  const binDir = cliInstaller.getCliBinDir();
  const nativeExe = cliInstaller.getCliExecutablePath();
  const pathEnv = String(process.env.PATH || '');
  const inPath = pathEnv
    .split(';')
    .some(
      (p) =>
        p.trim().replace(/\\+$/, '').toLowerCase() === binDir.replace(/\\+$/, '').toLowerCase(),
    );
  const clients = mcpClients.listMcpClients();
  const configuredClients = clients.filter((cl) => cl.configured);
  const pendingOutbox = outbox.filter((o) => o.status === 'pending').length;
  const deadLetterOutbox = outbox.filter((o) => o.status === 'dead_letter').length;
  const report = {
    ok: !status.error,
    version: store.APP_VERSION,
    cliShim: {
      installed: cliInstaller.isCliShimsInstalled(),
      nativeExe: Boolean(nativeExe),
      executablePath: nativeExe || null,
      binDir,
      inCurrentPath: inPath,
    },
    database: {
      ok: !status.error,
      mode: status.mode || 'error',
      endpoint: status.endpoint || null,
      activeTasks: status.activeTasks ?? null,
    },
    server: srvStatus,
    mcp: {
      detectedClients: clients.filter((cl) => cl.detected).map((cl) => cl.id),
      configuredClients: configuredClients.map((cl) => ({
        id: cl.id,
        usesLegacyCmd: cl.usesLegacyCmd,
      })),
    },
    webhookOutbox: { pending: pendingOutbox, deadLetter: deadLetterOutbox },
  };
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(c.bold(cliMsg.doctorTitle));
  console.log(
    `  CLI Shim : ${report.cliShim.nativeExe ? c.green('ag.exe (native)') : report.cliShim.installed ? c.yellow('legacy .cmd') : c.red('not installed')} ${c.dim(binDir)}`,
  );
  console.log(
    `  Database : ${report.database.ok ? c.green('OK') : c.red('ERR')} [${report.database.mode}] ${c.dim(String(report.database.endpoint || ''))}`,
  );
  console.log(
    `  Server   : ${srvStatus.running ? c.green(`ON ${srvStatus.url}`) : c.dim('OFF (offline-sqlite ready)')}`,
  );
  console.log(
    `  MCP      : ${configuredClients.length} ${cliMsg.doctorConfigured} / ${report.mcp.detectedClients.length} ${cliMsg.doctorDetected}`,
  );
  console.log(
    `  Webhook  : ${pendingOutbox} ${cliMsg.doctorPending}, ${deadLetterOutbox} ${cliMsg.doctorDeadLetter}`,
  );
}

async function handleServeCommand(rest, asJson, msg, cliMsg) {
  const incomingLabel = cliMsg?.incomingWebhookLabel || 'Incoming Webhook';
  const positional = stripOptions(rest, ['--port', '-p']);
  const action = (positional[0] || 'status').toLowerCase();
  const portVal = getOptionValue(rest, ['--port', '-p']);
  const port = portVal ? Number.parseInt(portVal, 10) : undefined;
  const foreground = hasAnyFlag(rest, ['--fg', '--foreground']);

  if (action === 'start' || action === 'baslat' || action === 'başlat' || foreground) {
    const res = await store.startHeadlessServer({ port, foreground });
    if (asJson) console.log(JSON.stringify(res, null, 2));
    else if (res.url) {
      console.log(
        `${c.green(msg.serverStarted)}: ${c.bold(res.url)} ${c.dim(`(PID ${res.pid ?? '?'})`)}`,
      );
      console.log(`${c.dim(incomingLabel)}: ${res.incomingWebhookUrl}`);
    }
    return;
  }
  if (action === 'stop' || action === 'durdur') {
    const res = await store.stopHeadlessServer();
    if (asJson) console.log(JSON.stringify(res, null, 2));
    else if (res.stopped) console.log(c.yellow(msg.serverStopped));
    else console.log(c.dim(res.error || res.message || msg.serverNotRunning));
    return;
  }
  const status = await store.getHeadlessServerStatus();
  if (asJson) console.log(JSON.stringify(status, null, 2));
  else if (status.running) {
    console.log(
      `${c.green('ON')} ${c.bold(status.url)} ${c.dim(status.headless ? '(headless)' : '(desktop)')}`,
    );
    console.log(`${c.dim(incomingLabel)}: ${status.incomingWebhookUrl}`);
  } else {
    console.log(c.dim(msg.serverNotRunning));
  }
}

async function handleConfigCommand(rest, asJson, msg, cliMsg) {
  if (hasAnyFlag(rest, ['--list', '-l'])) {
    if (asJson) {
      console.log(JSON.stringify(CONFIG_SCHEMA, null, 2));
      return;
    }
    console.log(c.bold(cliMsg.configListTitle));
    for (const item of CONFIG_SCHEMA) {
      console.log(
        `  ${c.cyan(item.key.padEnd(26, ' '))} ${c.dim(`[${item.type}]`)} ${item.desc} ${c.dim(`(default: ${item.def})`)}`,
      );
    }
    return;
  }
  const positional = stripOptions(rest);
  if (positional.length === 0) {
    const settings = await store.getSettings();
    if (asJson || process.env.AGENDAMEA_CLI_FORMAT === 'json') {
      console.log(JSON.stringify(settings, null, 2));
    } else {
      console.log(c.bold(cliMsg.configTitle));
      for (const [k, v] of Object.entries(settings)) {
        if (v === undefined) continue;
        const display =
          typeof v === 'object'
            ? JSON.stringify(v)
            : k.toLowerCase().includes('secret') && v
              ? '********'
              : String(v);
        console.log(`  ${c.cyan(k.padEnd(26, ' '))} ${display}`);
      }
    }
    return;
  }
  if (positional.length === 1) {
    const settings = await store.getSettings();
    const val = settings[positional[0]];
    console.log(asJson ? JSON.stringify(val ?? null) : String(val ?? ''));
    return;
  }
  const key = positional[0];
  const value = parseSettingValue(positional.slice(1).join(' '));
  const updated = await store.updateSettings({ [key]: value });
  if (asJson) console.log(JSON.stringify(updated, null, 2));
  else console.log(`${c.green(msg.configSaved)}: ${key} = ${String(updated[key] ?? value)}`);
}

module.exports = {
  handleMcpCommand,
  handleDynamicComplete,
  handleCompletionCommand,
  handleDoctorCommand,
  handleServeCommand,
  handleConfigCommand,
};
