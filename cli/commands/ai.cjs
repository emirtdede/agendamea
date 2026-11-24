'use strict';

const readline = require('node:readline');
const store = require('../../shared/localStore.cjs');
const {
  IS_STDOUT_TTY,
  IS_STDIN_TTY,
  c,
  hasAnyFlag,
  getOptionValue,
  stripOptions,
} = require('../lib/cliHelpers.cjs');

async function handleAiCommand(rest, asJson, cliMsg) {
  const sub = String(rest[0] || 'status').toLowerCase();
  if (sub === 'status' || sub === 'durum') {
    const force = hasAnyFlag(rest, ['--force', '-f']);
    const st = await store.getAiStatus({ force });
    if (asJson) {
      console.log(JSON.stringify(st, null, 2));
    } else {
      console.log(c.bold(cliMsg.aiHardwareTitle));
      console.log(`  ${cliMsg.aiModeLabel}   : ${st.mode || 'live-api'}`);
      console.log(
        `  ${cliMsg.aiCpuLabel}       : ${st.hardware.cpuModel || 'CPU'} (${st.hardware.cpuCores} cores)`,
      );
      console.log(`  ${cliMsg.aiRamLabel}       : ${st.hardware.ramGb} GB`);
      console.log(
        `  ${cliMsg.aiGpuLabel} : ${st.hardware.gpuName} (${st.hardware.vramGb} GB VRAM)`,
      );
      console.log(`  ${cliMsg.aiTierLabel} : ${c.green(st.recommendation.primaryOptionId)}`);
      console.log(
        `  ${cliMsg.aiOllamaLabel} : ${st.recommendation.externalOllama?.detected ? c.green(cliMsg.aiDetected) : c.dim(cliMsg.aiNotDetected)}`,
      );
      console.log(`  ${cliMsg.aiRagChunks} : ${st.ragIndexedChunks}`);
    }
    return;
  }
  if (sub === 'models' || sub === 'modeller') {
    const list = await store.listAiModels();
    if (asJson) {
      console.log(JSON.stringify(list, null, 2));
    } else {
      console.log(c.bold(cliMsg.aiModelsInstalled));
      for (const m of list.models) {
        const badge = m.verified ? c.green('[OK]') : c.dim('[--]');
        console.log(
          `  ${badge} ${c.bold(m.id)} (${m.role}, ${m.license}, ${Math.round(m.expectedBytes / 1048576)} MB)`,
        );
      }
    }
    return;
  }
  if (sub === 'download' || sub === 'indir') {
    const target = stripOptions(rest.slice(1))[0];
    if (!target) {
      console.error('Model ID or tier required (e.g. ag ai download tier-light).');
      process.exit(2);
    }
    const startedAt = Date.now();
    let lastNonTtyBucket = -1;
    const onSigInt = () => {
      if (IS_STDOUT_TTY && !asJson) process.stdout.write('\n');
      console.error(c.yellow(cliMsg.aiDownloadCancelled));
      process.exit(130);
    };
    process.once('SIGINT', onSigInt);

    const onProgress = (prog) => {
      if (asJson || !prog) return;
      const pct = Math.max(0, Math.min(100, Math.round(Number(prog.percent) || 0)));
      const recvMb = ((Number(prog.receivedBytes) || 0) / 1048576).toFixed(1);
      const totalMb = ((Number(prog.totalBytes) || 0) / 1048576).toFixed(1);
      const elapsedSec = Math.max(0.2, (Date.now() - startedAt) / 1000);
      const mbps = ((Number(prog.receivedBytes) || 0) / 1048576 / elapsedSec).toFixed(1);
      if (IS_STDOUT_TTY) {
        const width = 20;
        const filled = Math.round((pct / 100) * width);
        const bar = `${'#'.repeat(filled)}${'-'.repeat(width - filled)}`;
        process.stdout.write(
          `\r${cliMsg.aiDownloading} [${bar}] ${String(pct).padStart(3, ' ')}% | ${recvMb}/${totalMb} MB | ${mbps} MB/s   `,
        );
      } else {
        const bucket = Math.floor(pct / 10) * 10;
        if (bucket > lastNonTtyBucket) {
          lastNonTtyBucket = bucket;
          console.log(
            `${cliMsg.aiDownloading} ${prog.modelId || target}: ${pct}% (${recvMb}/${totalMb} MB)`,
          );
        }
      }
    };

    try {
      const res = await store.downloadAiModel(target, { onProgress });
      if (IS_STDOUT_TTY && !asJson) process.stdout.write('\n');
      if (asJson) console.log(JSON.stringify(res, null, 2));
      else
        console.log(
          res.ok
            ? c.green(`${cliMsg.aiDownloadDone}: ${target}`)
            : c.red(res.error || 'Download failed.'),
        );
      if (!res.ok) process.exit(1);
    } finally {
      process.removeListener('SIGINT', onSigInt);
    }
    return;
  }
  if (sub === 'delete' || sub === 'sil' || sub === 'rm') {
    const target = stripOptions(rest.slice(1))[0];
    if (!target) {
      console.error('Model ID or "all" required (e.g. ag ai delete all).');
      process.exit(2);
    }
    const res = await store.deleteAiModel(target);
    if (asJson) console.log(JSON.stringify(res, null, 2));
    else console.log(c.green(`${cliMsg.aiModelDeleted}: ${target}`));
    return;
  }
  console.error(
    `Unknown ai subcommand: "${sub}". Use: status | models | download <id|tier> | delete <id|all>`,
  );
  process.exit(2);
}

async function handleRagCommand(rest, asJson, msg) {
  const topKRaw = getOptionValue(rest, ['--top', '-k']);
  const minScoreRaw = getOptionValue(rest, ['--min-score']);
  const query = stripOptions(rest, ['--top', '-k', '--min-score']).join(' ').trim();
  if (!query) {
    console.error(msg.searchRequired);
    process.exit(2);
  }
  const result = await store.semanticSearchRag(query, {
    topK: topKRaw ? Number(topKRaw) : 5,
    minScore: minScoreRaw !== null ? Number(minScoreRaw) : 0.35,
  });
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else if (!result.hits || result.hits.length === 0) {
    console.log(c.dim(`${msg.noTasks} [${result.mode || 'fts5-only'}]`));
  } else {
    if (result.mode) {
      console.log(
        c.dim(`Mode: ${result.mode}${result.degradedReason ? ` (${result.degradedReason})` : ''}`),
      );
    }
    result.hits.forEach((h, i) => {
      console.log(
        `${c.bold(String(i + 1))}. ${c.cyan(`[${h.score.toFixed(2)}]`)} ${c.bold(h.title)}`,
      );
      if (h.matchedChunkText && h.matchedChunkText !== h.title) {
        console.log(`   ${c.dim(h.matchedChunkText.slice(0, 180))}`);
      }
    });
  }
}

async function handleAskCommand(rest, asJson, lang, cliMsg) {
  const readOnly = hasAnyFlag(rest, ['--read-only', '-r']);
  const autoYes = hasAnyFlag(rest, ['--yes', '-y']);
  const confirmTokenArg = getOptionValue(rest, ['--confirm-token']);
  const selectedTodoId = getOptionValue(rest, ['--select']);
  const text = stripOptions(rest, ['--confirm-token', '--select']).join(' ').trim();
  if (!text) {
    console.error(cliMsg.askMissingText);
    process.exit(2);
  }
  let res = await store.askAiAssistant(text, {
    readOnly,
    language: lang,
    confirmToken: confirmTokenArg || undefined,
    selectedTodoId: selectedTodoId || undefined,
  });

  if (res?.requiresConfirmation && res.confirmationToken) {
    if (autoYes) {
      res = await store.askAiAssistant(text, {
        readOnly: false,
        language: lang,
        confirmToken: res.confirmationToken,
        selectedTodoId: selectedTodoId || undefined,
      });
    } else if (IS_STDIN_TTY && IS_STDOUT_TTY && !asJson) {
      console.log(c.yellow(res.displayText || res.spokenText || ''));
      const answer = await new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(cliMsg.askPromptConfirm, (ans) => {
          rl.close();
          resolve(
            String(ans || '')
              .trim()
              .toLowerCase(),
          );
        });
      });
      if (answer === 'e' || answer === 'evet' || answer === 'y' || answer === 'yes') {
        res = await store.askAiAssistant(text, {
          readOnly: false,
          language: lang,
          confirmToken: res.confirmationToken,
          selectedTodoId: selectedTodoId || undefined,
        });
      } else {
        console.log(c.dim(cliMsg.askCancelled));
        return;
      }
    } else {
      if (asJson) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.error(c.yellow(res.displayText || cliMsg.askConfirmRequiredNonTty));
        console.error(
          c.dim(`${cliMsg.askConfirmRequiredNonTty} (token: ${res.confirmationToken})`),
        );
      }
      process.exit(2);
    }
  }

  if (asJson) console.log(JSON.stringify(res, null, 2));
  else console.log(res.displayText || res.spokenText || '');
}

module.exports = {
  handleAiCommand,
  handleRagCommand,
  handleAskCommand,
};
