'use strict';

const store = require('../../shared/localStore.cjs');
const {
  c,
  hasAnyFlag,
  getOptionValue,
  stripOptions,
  readStdinUtf8,
} = require('../lib/cliHelpers.cjs');

async function handleSyncCommand(rest, asJson, msg, cliMsg) {
  const positional = stripOptions(rest);
  const sub = (positional[0] || '').toLowerCase();
  if (sub === 'status' || sub === 'durum') {
    const st = await store.getCloudStatus();
    const forceLegacyJson =
      process.env.AGENDAMEA_CLI_LEGACY_JSON === '1' || process.env.AGENDAMEA_CLI_FORMAT === 'json';
    if (asJson || forceLegacyJson) {
      console.log(JSON.stringify(st, null, 2));
    } else {
      console.log(c.bold(cliMsg.syncTitle));
      console.log(
        `  Status   : ${st.connected ? c.green(cliMsg.syncConnected) : c.dim(cliMsg.syncDisconnected)}`,
      );
      if (st.folderPath) console.log(`  ${cliMsg.syncFolder}   : ${st.folderPath}`);
      console.log(
        `  ${cliMsg.syncAuto} : ${st.autoSync ? c.green(cliMsg.yesLabel) : c.dim(cliMsg.noLabel)}`,
      );
      if (st.lastSyncedAt) console.log(`  ${cliMsg.syncLast} : ${st.lastSyncedAt}`);
      if (Array.isArray(st.detectedProviders) && st.detectedProviders.length > 0) {
        const names = st.detectedProviders
          .map((p) => `${p.name}${p.detected ? ' [OK]' : ''}`)
          .join(', ');
        console.log(`  ${cliMsg.syncProviders}: ${names}`);
      }
    }
    return;
  }
  if (sub === 'auto' || sub === 'otomatik') {
    const res = await store.connectCloud(undefined, !hasAnyFlag(rest, ['--no-auto']));
    if (asJson) console.log(JSON.stringify(res, null, 2));
    else console.log(`${c.green(msg.cloudConnected)}: ${res?.folderPath || ''}`);
    return;
  }
  if (sub === 'set' || sub === 'connect' || sub === 'bagla' || sub === 'bağla') {
    const folder = positional.slice(1).join(' ').trim();
    const res = await store.connectCloud(folder || undefined, !hasAnyFlag(rest, ['--no-auto']));
    if (asJson) console.log(JSON.stringify(res, null, 2));
    else console.log(`${c.green(msg.cloudConnected)}: ${res?.folderPath || folder}`);
    return;
  }
  if (sub === 'off' || sub === 'disconnect' || sub === 'kes') {
    const res = await store.disconnectCloud();
    if (asJson) console.log(JSON.stringify(res, null, 2));
    else console.log(c.yellow(msg.cloudDisconnected));
    return;
  }
  if (sub === 'pull' || sub === 'cek' || sub === 'çek' || sub === 'restore') {
    const res = await store.pullCloud();
    if (asJson) console.log(JSON.stringify(res, null, 2));
    else
      console.log(
        `${c.green(msg.cloudPulled)}: ${res.bootstrap?.todos?.length ?? 0} ${msg.tasks.toLowerCase()}`,
      );
    return;
  }
  const res = await store.syncCloud();
  if (asJson) console.log(JSON.stringify(res, null, 2));
  else console.log(`${c.green(msg.synced)}: ${res?.folderPath || ''}`);
}

async function handleHookCommand(rest, asJson, msg, cliMsg) {
  const positional = stripOptions(rest, ['--limit']);
  const sub = (positional[0] || '').toLowerCase();
  if (sub === 'outbox' || sub === 'kuyruk' || sub === 'queue') {
    const limit = Number(getOptionValue(rest, ['--limit']) || positional[1] || 20);
    const items = await store.getWebhookOutbox(limit);
    if (asJson) {
      console.log(JSON.stringify(items, null, 2));
      return;
    }
    console.log(c.bold(cliMsg.webhookOutboxTitle));
    if (items.length === 0) {
      console.log(c.dim(msg.logsEmpty));
      return;
    }
    items.forEach((it) => {
      const stBadge =
        it.status === 'delivered'
          ? c.green('OK')
          : it.status === 'dead_letter'
            ? c.red('DEAD')
            : c.yellow('WAIT');
      console.log(
        `  ${stBadge} ${c.dim(it.id)} ${c.bold(it.event)} -> ${it.targetUrl} ${c.dim(`(x${it.attempts}/${it.maxAttempts}, HTTP ${it.lastStatusCode ?? '-'})`)}${it.lastError ? ` ${c.red(it.lastError)}` : ''}`,
      );
    });
    return;
  }
  if (sub === 'replay' || sub === 'tekrar') {
    const targetId = positional[1];
    if (!targetId) {
      console.error('Usage: ag hook replay <outbox-id>');
      process.exit(2);
    }
    const res = await store.replayWebhookOutbox(targetId);
    if (asJson) console.log(JSON.stringify(res, null, 2));
    else if (res.ok) console.log(`${c.green(cliMsg.webhookReplayed)}: ${targetId}`);
    else {
      console.error(c.red(`${msg.webhookFail}: ${res.error || 'Error'}`));
      process.exit(1);
    }
    return;
  }
  if (sub === 'logs' || sub === 'log' || sub === 'kayit' || sub === 'kayıt') {
    if (positional[1] && ['clear', 'temizle'].includes(positional[1].toLowerCase())) {
      const cleared = await store.clearWebhookLogs();
      if (asJson) console.log(JSON.stringify(cleared, null, 2));
      else console.log(c.yellow(`${msg.logsCleared} (${cleared.cleared ?? 0})`));
      return;
    }
    const limit = Number(getOptionValue(rest, ['--limit']) || positional[1] || 20);
    const logs = await store.getWebhookLogs(limit);
    if (asJson) {
      console.log(JSON.stringify(logs, null, 2));
      return;
    }
    if (logs.length === 0) {
      console.log(c.dim(msg.logsEmpty));
      return;
    }
    logs.forEach((l) => {
      const badge = l.ok ? c.green('OK') : c.red('ERR');
      console.log(
        `${c.dim(l.createdAt.slice(0, 19).replace('T', ' '))} [${l.direction}] ${badge} ${c.bold(l.event)} ${c.dim(`HTTP ${l.statusCode ?? '-'} · ${l.latencyMs}ms · x${l.attempts}`)}${l.error ? ` ${c.red(l.error)}` : ''}`,
      );
    });
    return;
  }
  if (sub === 'events' || sub === 'olaylar') {
    const ev = positional.slice(1).join(',').trim();
    const updated = await store.updateSettings({ webhookEvents: ev === 'all' ? '*' : ev });
    if (asJson) console.log(JSON.stringify(updated, null, 2));
    else
      console.log(`${c.green(msg.configSaved)}: webhookEvents = ${updated.webhookEvents || '*'}`);
    return;
  }
  if (sub === 'set') {
    const url = positional[1] || '';
    const secret = positional[2];
    const patch = { webhookUrl: url, webhookEnabled: Boolean(url) };
    if (secret !== undefined) patch.webhookSecret = secret;
    const updated = await store.updateSettings(patch);
    if (asJson) console.log(JSON.stringify(updated, null, 2));
    else
      console.log(`${c.green(msg.configSaved)}: webhookUrl = ${updated.webhookUrl || '(empty)'}`);
    return;
  }
  if (sub === 'on' || sub === 'off') {
    const updated = await store.updateSettings({ webhookEnabled: sub === 'on' });
    if (asJson) console.log(JSON.stringify(updated, null, 2));
    else
      console.log(
        `${c.green(msg.configSaved)}: webhookEnabled = ${updated.webhookEnabled ? 'true' : 'false'}`,
      );
    return;
  }
  const urlArg = positional.find((a) => a !== 'test');
  const result = await store.testWebhook(urlArg || undefined);
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(
      c.green(`${msg.webhookOk} (HTTP ${result.statusCode ?? 200}, ${result.latencyMs ?? 0}ms)`),
    );
  } else {
    console.error(c.red(`${msg.webhookFail}: ${result.error || 'Error'}`));
    process.exit(1);
  }
}

async function handleExportCommand(rest, asJson, msg) {
  const outFile = stripOptions(rest)[0];
  const res = await store.exportBackup(outFile);
  if (asJson || !outFile) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(
      `${c.green(msg.exported)}: ${res.filePath} (${res.todos} ${msg.tasks.toLowerCase()})`,
    );
  }
}

async function handleImportCommand(rest, asJson, msg, cliMsg) {
  const inFile = stripOptions(rest)[0];
  if (!inFile) {
    console.error(cliMsg.importMissingFile);
    process.exit(2);
  }
  let payloadOrPath = inFile;
  if (inFile === '-') {
    const rawStdin = await readStdinUtf8();
    payloadOrPath = JSON.parse(rawStdin);
  }
  const restored = await store.importBackup(payloadOrPath);
  if (asJson) console.log(JSON.stringify(restored, null, 2));
  else
    console.log(
      `${c.green(msg.imported)}: ${restored.todos.length} ${msg.tasks.toLowerCase()}, ${restored.categories.length} ${msg.categories.toLowerCase()}`,
    );
}

module.exports = {
  handleSyncCommand,
  handleHookCommand,
  handleExportCommand,
  handleImportCommand,
};
