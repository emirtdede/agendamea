#!/usr/bin/env node
'use strict';

(function runAgendameaCli() {
  // Fast-path zero-chain in-process MCP launch BEFORE loading colors/formatters so stdout stays pure JSON-RPC
  if (process.argv[2] && process.argv[2].toLowerCase() === 'mcp' && process.argv.length === 3) {
    console.log = (...a) => console.error(...a);
    require('../mcp/server.cjs').startMcpServer();
    return;
  }

  const store = require('../shared/localStore.cjs');
  const cliParser = require('../shared/cliParser.cjs');
  const cliViewState = require('../shared/cliViewState.cjs');
  const { getCliMessages, getCliLabels } = require('../shared/cliMessages.cjs');
  const {
    QUIET_MODE,
    c,
    hasAnyFlag,
    getOptionValue,
    stripOptions,
    readStdinUtf8,
    parseBatchSelectors,
    formatDueBadge,
    suggestCommand,
    getCommandHelp,
    printTaskList,
    resolveViewSelectors,
    parseNaturalTaskTokens,
  } = require('./lib/cliHelpers.cjs');
  const {
    handleMcpCommand,
    handleDynamicComplete,
    handleCompletionCommand,
    handleDoctorCommand,
    handleServeCommand,
    handleConfigCommand,
  } = require('./commands/system.cjs');
  const { handleAiCommand, handleRagCommand, handleAskCommand } = require('./commands/ai.cjs');
  const {
    handleStatusCommand,
    handleMatrixCommand,
    handleCalendarCommand,
    handleKanbanCommand,
    handleSubtaskCommand,
    handleCategoryCommand,
    handleTrashCommand,
  } = require('./commands/viewsAndCatalog.cjs');
  const {
    handleSyncCommand,
    handleHookCommand,
    handleExportCommand,
    handleImportCommand,
  } = require('./commands/webhooksAndSync.cjs');

  async function main() {
    const args = process.argv.slice(2);
    const firstArg = args[0] || '';
    const asJson = hasAnyFlag(args, ['-j', '--json']);

    if (firstArg === '-v' || firstArg === '--version' || firstArg.toLowerCase() === 'version') {
      console.log(`agendamea ${store.APP_VERSION}`);
      return;
    }

    if (firstArg.toLowerCase() === 'mcp') {
      await handleMcpCommand(args, asJson);
      return;
    }

    if (firstArg === '__complete') {
      await handleDynamicComplete(args);
      return;
    }

    const lang = await store.getPreferredLanguage();
    const msg = getCliLabels(lang, store.APP_VERSION);
    const cliMsg = getCliMessages(lang);

    if (firstArg.toLowerCase() === 'completion') {
      handleCompletionCommand(args, asJson, cliMsg);
      return;
    }

    if (firstArg.toLowerCase() === 'doctor' || firstArg.toLowerCase() === 'saglik') {
      await handleDoctorCommand(asJson, cliMsg);
      return;
    }

    const isCategoryFilterShortcut = firstArg.startsWith('/') && firstArg.length > 1;
    const cmd = isCategoryFilterShortcut
      ? 'list'
      : !firstArg || firstArg.startsWith('-')
        ? firstArg === '-h' || firstArg === '--help'
          ? 'help'
          : 'list'
        : firstArg.toLowerCase();
    const rest =
      isCategoryFilterShortcut || !firstArg || firstArg.startsWith('-') ? args : args.slice(1);

    if (cmd === 'help' || cmd === 'yardim' || cmd === 'yardım') {
      const topic = rest.find((r) => !r.startsWith('-'));
      if (topic) {
        const lower = topic.toLowerCase();
        if (['all', 'tumu', 'tümü', 'full'].includes(lower)) {
          console.log(msg.fullHelp);
          return;
        }
        const perCmd = getCommandHelp(lower, lang, cliMsg);
        if (perCmd) {
          console.log(perCmd);
          return;
        }
      }
      console.log(msg.shortHelp);
      return;
    }

    if (hasAnyFlag(rest, ['--help'])) {
      const perCmd = getCommandHelp(cmd, lang, cliMsg);
      console.log(perCmd || msg.shortHelp);
      return;
    }

    if (cmd === 'stat' || cmd === 'status' || cmd === 'durum') {
      await handleStatusCommand(asJson, msg);
      return;
    }

    if (cmd === 'matris' || cmd === 'matrix') {
      await handleMatrixCommand(asJson, msg);
      return;
    }

    if (cmd === 'cal' || cmd === 'calendar' || cmd === 'takvim') {
      await handleCalendarCommand(rest, asJson, msg);
      return;
    }

    if (cmd === 'kanban' || cmd === 'board' || cmd === 'pano') {
      await handleKanbanCommand(rest, asJson, msg);
      return;
    }

    if (cmd === 'serve' || cmd === 'server' || cmd === 'daemon' || cmd === 'sunucu') {
      await handleServeCommand(rest, asJson, msg, cliMsg);
      return;
    }

    if (cmd === 'install' || cmd === 'kur') {
      const binDir = getOptionValue(rest, ['--dir']);
      const skipPathUpdate = hasAnyFlag(rest, ['--no-path']);
      const res = await store.installCli({ binDir: binDir || undefined, skipPathUpdate });
      if (asJson) console.log(JSON.stringify(res, null, 2));
      else if (res.ok) console.log(`${c.green(msg.cliInstalled)}: ${res.binDir}`);
      else {
        console.error(c.red(res.error || 'Install failed'));
        process.exit(1);
      }
      return;
    }

    if (cmd === 'uninstall' || cmd === 'kaldir' || cmd === 'kaldır') {
      const binDir = getOptionValue(rest, ['--dir']);
      const skipPathUpdate = hasAnyFlag(rest, ['--no-path']);
      const res = await store.uninstallCli({ binDir: binDir || undefined, skipPathUpdate });
      if (asJson) console.log(JSON.stringify(res, null, 2));
      else if (res.ok) console.log(`${c.yellow(msg.cliUninstalled)}: ${res.binDir}`);
      else {
        console.error(c.red(res.error || 'Uninstall failed'));
        process.exit(1);
      }
      return;
    }

    if (cmd === 'update' || cmd === 'guncelle' || cmd === 'güncelle') {
      const res = await store.checkForUpdates();
      if (asJson) {
        console.log(JSON.stringify(res, null, 2));
        return;
      }
      if (res.updateAvailable) {
        console.log(
          `${c.green(msg.updateAvailable)}: v${res.currentVersion} -> v${res.latestVersion} (${res.releaseUrl})`,
        );
      } else {
        console.log(`${c.green(msg.upToDate)}: v${res.currentVersion}`);
      }
      return;
    }

    if (cmd === 'bak' || cmd === 'show' || cmd === 'info' || cmd === 'detay') {
      const rawSelector = rest
        .filter((a) => !a.startsWith('-'))
        .join(' ')
        .trim();
      if (!rawSelector) {
        console.error(msg.selectorRequired);
        process.exit(2);
      }
      const [selector] = resolveViewSelectors([rawSelector], cliMsg, { strictOnExpired: false });
      const task = await store.getTask(selector);
      if (asJson) {
        console.log(JSON.stringify(task, null, 2));
        return;
      }
      console.log(`${c.bold(task.title)} ${c.dim(`(${task.id})`)}`);
      console.log(
        `${msg.priority}: ${task.priority}${task.important ? ` · ${c.yellow(msg.important)}` : ''}${task.pinned ? ` · ${c.magenta('^')}` : ''}${task.categoryName ? ` · ${msg.category}: ${task.categoryName}` : ''}`,
      );
      const sched = formatDueBadge(task, msg);
      if (sched) console.log(`${msg.schedule}:${sched}`);
      if (Array.isArray(task.tags) && task.tags.length > 0) {
        console.log(task.tags.map((tg) => c.cyan(`#${tg}`)).join(' '));
      }
      if (task.notes) console.log(`\n${c.dim(`${msg.notes}:`)}\n${task.notes}`);
      if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
        console.log(`\n${c.dim(`${msg.subtasks}:`)}`);
        task.subtasks.forEach((s, idx) => {
          console.log(
            `  ${c.dim(`${idx + 1}.`)} ${s.completed ? c.green('[x]') : '[ ]'} ${s.title}`,
          );
        });
      }
      return;
    }

    if (cmd === 'sub' || cmd === 'subtask' || cmd === 'alt') {
      await handleSubtaskCommand(rest, asJson, msg);
      return;
    }

    if (cmd === 'cat' || cmd === 'cats' || cmd === 'categories' || cmd === 'kategoriler') {
      await handleCategoryCommand(rest, asJson, msg);
      return;
    }

    if (cmd === 'cop' || cmd === 'çöp' || cmd === 'trash') {
      await handleTrashCommand(rest, asJson, msg);
      return;
    }

    if (cmd === 'geri' || cmd === 'undo' || cmd === 'restore') {
      const selector = stripOptions(rest).join(' ').trim();
      const res = await store.restoreItem(selector || undefined, 'auto');
      if (asJson) console.log(JSON.stringify(res.item, null, 2));
      else console.log(`${c.bold(res.item.title || res.item.name)} ${c.green(msg.restored)}`);
      return;
    }

    if (cmd === 'temizle' || cmd === 'clear-done' || cmd === 'clear-completed') {
      const cat = stripOptions(rest).join(' ').trim();
      const res = await store.clearCompleted(cat || undefined);
      if (asJson) console.log(JSON.stringify(res, null, 2));
      else console.log(`${c.yellow(msg.clearedDone)} (${res.clearedCount})`);
      return;
    }

    if (cmd === 'export' || cmd === 'yedekle') {
      await handleExportCommand(rest, asJson, msg);
      return;
    }

    if (cmd === 'import' || cmd === 'yukle' || cmd === 'yükle') {
      await handleImportCommand(rest, asJson, msg, cliMsg);
      return;
    }

    if (cmd === 'sync' || cmd === 'esitle' || cmd === 'eşitle') {
      await handleSyncCommand(rest, asJson, msg, cliMsg);
      return;
    }

    if (cmd === 'reset' || cmd === 'sifirla' || cmd === 'sıfırla') {
      if (!hasAnyFlag(rest, ['--yes', '-y'])) {
        console.error(msg.confirmYesRequired);
        process.exit(2);
      }
      const resetSettings = hasAnyFlag(rest, ['--all', '--settings']);
      const fresh = await store.resetAllData({ resetSettings });
      if (asJson) console.log(JSON.stringify(fresh, null, 2));
      else console.log(c.yellow(msg.resetDone));
      return;
    }

    if (cmd === 'config' || cmd === 'ayar' || cmd === 'settings') {
      await handleConfigCommand(rest, asJson, msg, cliMsg);
      return;
    }

    if (cmd === 'hook' || cmd === 'webhook') {
      await handleHookCommand(rest, asJson, msg, cliMsg);
      return;
    }

    if (cmd === 'ara' || cmd === 'find' || cmd === 'search' || cmd === '/') {
      const query = stripOptions(rest, [
        '--from',
        '--to',
        '--sort',
        '--cat',
        '--category',
        '--priority',
        '--tag',
      ])
        .join(' ')
        .trim();
      if (!query) {
        console.error(msg.searchRequired);
        process.exit(2);
      }
      const [list, cats] = await Promise.all([
        store.listTasks({
          filter: hasAnyFlag(rest, ['-a', '--all']) ? 'all' : 'active',
          query,
          dateFrom: getOptionValue(rest, ['--from']),
          dateTo: getOptionValue(rest, ['--to']),
          sortBy: getOptionValue(rest, ['--sort']) || 'manual',
          category: getOptionValue(rest, ['--cat', '--category']) || undefined,
          priority: getOptionValue(rest, ['--priority']) || undefined,
        }),
        store.listCategories(),
      ]);
      if (asJson) {
        const dataDir = store.getCandidateDataDirs()[0];
        cliViewState.saveViewSnapshot(`search:${query}`, list, { dataDir });
        console.log(JSON.stringify(list, null, 2));
        return;
      }
      printTaskList(list, msg, new Map(cats.map((x) => [x.id, x.name])), {
        viewName: `search:${query}`,
      });
      return;
    }

    if (
      cmd === 'list' ||
      cmd === 'ls' ||
      cmd === 'today' ||
      cmd === 'bugun' ||
      cmd === 'bugün' ||
      cmd === 'imp' ||
      cmd === 'onemli' ||
      cmd === 'önemli' ||
      cmd === 'tamam'
    ) {
      const isToday =
        cmd === 'today' ||
        cmd === 'bugun' ||
        cmd === 'bugün' ||
        hasAnyFlag(rest, ['-t', '--today']);
      const isImportant =
        cmd === 'imp' ||
        cmd === 'onemli' ||
        cmd === 'önemli' ||
        hasAnyFlag(rest, ['-i', '--important']);
      const isDone = cmd === 'tamam' || hasAnyFlag(rest, ['-c', '--done']);
      const isAll = hasAnyFlag(rest, ['-a', '--all']);
      const isPinned = hasAnyFlag(rest, ['--pinned']);
      const slashCat = rest.find((t) => t.startsWith('/') && t.length > 1);
      const category =
        getOptionValue(rest, ['--cat', '--category']) || (slashCat ? slashCat.slice(1) : undefined);

      const filter = isDone
        ? 'completed'
        : isAll
          ? 'all'
          : isPinned
            ? 'pinned'
            : isToday
              ? 'today'
              : isImportant
                ? 'important'
                : 'active';

      const [rawList, cats] = await Promise.all([
        store.listTasks({
          filter,
          query: getOptionValue(rest, ['-q', '--query']),
          dateFrom: getOptionValue(rest, ['--from']),
          dateTo: getOptionValue(rest, ['--to']),
          category,
          sortBy: getOptionValue(rest, ['--sort']) || 'manual',
          priority: getOptionValue(rest, ['--priority', '-p']) || undefined,
          tag: getOptionValue(rest, ['--tag']) || undefined,
        }),
        store.listCategories(),
      ]);
      const list = isToday && isImportant ? rawList.filter((t) => t.important) : rawList;
      const viewName = category ? `cat:${category}` : filter;
      if (asJson) {
        const dataDir = store.getCandidateDataDirs()[0];
        cliViewState.saveViewSnapshot(viewName, list, { dataDir });
        console.log(JSON.stringify(list, null, 2));
        return;
      }
      printTaskList(list, msg, new Map(cats.map((x) => [x.id, x.name])), { viewName });
      return;
    }

    if (cmd === 'move' || cmd === 'tasi' || cmd === 'taşı') {
      const positional = stripOptions(rest);
      if (positional.length < 2) {
        console.error(msg.selectorRequired);
        process.exit(2);
      }
      const pos = positional[positional.length - 1];
      const sel = positional.slice(0, -1).join(' ');
      const moved = await store.moveTask(sel, pos);
      if (asJson) console.log(JSON.stringify(moved, null, 2));
      else if (!QUIET_MODE)
        console.log(`${c.green(msg.moved)}: ${c.bold(moved.title)} -> #${moved.position}`);
      return;
    }

    if (cmd === 'add' || cmd === '+' || cmd === 'a' || cmd === 'ekle') {
      const positionalOnly = rest.filter(
        (t) => t !== '-j' && t !== '--json' && t !== '--no-color' && t !== '--quiet',
      );
      if (positionalOnly[0] === '-' || (positionalOnly.length === 0 && !process.stdin.isTTY)) {
        const raw = await readStdinUtf8();
        const lines = raw
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length === 0) {
          console.error(msg.titleRequired);
          process.exit(2);
        }
        const createdList = [];
        for (const line of lines) {
          const parsedLine = parseNaturalTaskTokens(cliParser.splitShellLine(line), false);
          if (parsedLine.title) createdList.push(await store.addTask(parsedLine));
        }
        if (asJson) console.log(JSON.stringify(createdList, null, 2));
        else if (!QUIET_MODE) {
          for (const item of createdList) {
            console.log(`${c.green(msg.added)}: ${c.bold(item.title)}`);
          }
        }
        return;
      }
      const parsed = parseNaturalTaskTokens(rest, false);
      if (!parsed.title) {
        console.error(msg.titleRequired);
        process.exit(2);
      }
      const created = await store.addTask(parsed);
      if (asJson) {
        console.log(JSON.stringify(created, null, 2));
      } else if (!QUIET_MODE) {
        const dueStr = formatDueBadge(created, msg);
        const tagStr =
          Array.isArray(created.tags) && created.tags.length > 0
            ? `  ${created.tags.map((tg) => c.cyan(`#${tg}`)).join(' ')}`
            : '';
        console.log(`${c.green(msg.added)}: ${c.bold(created.title)}${dueStr}${tagStr}`);
      }
      return;
    }

    if (cmd === 'edit' || cmd === 'duzenle' || cmd === 'düzenle' || cmd === 'set') {
      const explicitSelector = getOptionValue(rest, ['--selector']);
      const isEditBoundaryToken = (tok) =>
        tok.startsWith('-') ||
        tok.startsWith('@') ||
        tok.startsWith('+') ||
        tok.startsWith('#') ||
        tok.startsWith('/') ||
        /^(p|c|t):/i.test(tok) ||
        tok === 'i:' ||
        tok === 'imp:' ||
        tok === 'pin:' ||
        tok === '!' ||
        tok === '*' ||
        tok === '^' ||
        /^([01]?\d|2[0-3])[:.][0-5]\d$/.test(tok);

      let selector = explicitSelector || '';
      let fieldTokens = [];

      if (explicitSelector) {
        for (let i = 0; i < rest.length; i += 1) {
          if (rest[i] === '--selector') {
            i += 1;
            continue;
          }
          if (rest[i].startsWith('--selector=')) continue;
          fieldTokens.push(rest[i]);
        }
      } else {
        let splitIdx = rest.findIndex((tok) => isEditBoundaryToken(tok));
        if (splitIdx === -1) splitIdx = rest.length;
        const headWords = rest.slice(0, splitIdx);
        const tailTokens = rest.slice(splitIdx);
        if (headWords.length === 0) {
          console.error(msg.selectorRequired);
          process.exit(2);
        }
        const firstIsIdOrNum =
          /^\d+$/.test(headWords[0]) || /^(todo-)?[0-9a-f]{4,36}$/i.test(headWords[0]);
        if (headWords.length > 1 && firstIsIdOrNum && !hasAnyFlag(tailTokens, ['--title'])) {
          selector = headWords[0];
          fieldTokens = ['--title', headWords.slice(1).join(' '), ...tailTokens];
        } else {
          selector = headWords.join(' ');
          fieldTokens = tailTokens;
        }
      }

      const [resolvedSelector] = resolveViewSelectors([selector], cliMsg, {
        strictOnExpired: true,
      });
      const parsed = parseNaturalTaskTokens(fieldTokens, true);
      const hasExplicitTitle =
        hasAnyFlag(fieldTokens, ['--title']) || fieldTokens.some((t) => t.startsWith('--title='));
      const patch = {};
      if (hasExplicitTitle && parsed.title) patch.title = parsed.title;
      if (parsed.notes !== undefined) patch.notes = parsed.notes;
      if (parsed.startDate !== undefined) patch.startDate = parsed.startDate;
      if (parsed.dueDate !== undefined) patch.dueDate = parsed.dueDate;
      if (parsed.dueTime !== undefined) patch.dueTime = parsed.dueTime;
      if (parsed.priority !== undefined) patch.priority = parsed.priority;
      if (parsed.important !== undefined) patch.important = parsed.important;
      if (parsed.pinned !== undefined) patch.pinned = parsed.pinned;
      if (parsed.tags !== undefined) patch.tags = parsed.tags;
      if (parsed.category !== undefined) patch.category = parsed.category;
      const updated = await store.updateTask(resolvedSelector, patch);
      if (asJson) console.log(JSON.stringify(updated, null, 2));
      else
        console.log(
          `${c.green(msg.updated)}: ${c.bold(updated.title)}${formatDueBadge(updated, msg)}`,
        );
      return;
    }

    if (cmd === 'ok' || cmd === 'done' || cmd === 'd' || cmd === 'complete' || cmd === 'bitir') {
      const rawSelectors = parseBatchSelectors(stripOptions(rest));
      if (rawSelectors.length === 0) {
        console.error(msg.selectorRequired);
        process.exit(2);
      }
      const selectors = resolveViewSelectors(rawSelectors, cliMsg, { strictOnExpired: true });
      if (selectors.length > 1) {
        const results = await store.batchCompleteTasks(selectors);
        if (asJson) console.log(JSON.stringify(results, null, 2));
        else if (!QUIET_MODE) {
          results.forEach((u) => {
            console.log(
              `${u.completed ? c.green(msg.completed) : c.yellow(msg.reopened)}: ${c.bold(u.title)}`,
            );
          });
        }
        return;
      }
      const updated = await store.completeTask(selectors[0]);
      if (asJson) console.log(JSON.stringify(updated, null, 2));
      else if (!QUIET_MODE) {
        console.log(
          `${updated.completed ? c.green(msg.completed) : c.yellow(msg.reopened)}: ${c.bold(updated.title)}`,
        );
      }
      return;
    }

    if (cmd === 'pin' || cmd === 'sabitle') {
      const rawSelectors = parseBatchSelectors(stripOptions(rest));
      if (rawSelectors.length === 0) {
        console.error(msg.selectorRequired);
        process.exit(2);
      }
      const selectors = resolveViewSelectors(rawSelectors, cliMsg, { strictOnExpired: true });
      if (selectors.length > 1) {
        const results = await store.batchPinTasks(selectors);
        if (asJson) console.log(JSON.stringify(results, null, 2));
        else if (!QUIET_MODE) {
          results.forEach((u) => {
            console.log(
              `${u.pinned ? c.magenta(msg.pinned) : c.dim(msg.unpinned)}: ${c.bold(u.title)}`,
            );
          });
        }
        return;
      }
      const updated = await store.pinTask(selectors[0]);
      if (asJson) console.log(JSON.stringify(updated, null, 2));
      else if (!QUIET_MODE) {
        console.log(
          `${updated.pinned ? c.magenta(msg.pinned) : c.dim(msg.unpinned)}: ${c.bold(updated.title)}`,
        );
      }
      return;
    }

    if (cmd === 'ai') {
      await handleAiCommand(rest, asJson, cliMsg);
      return;
    }

    if (cmd === 'rag') {
      await handleRagCommand(rest, asJson, msg);
      return;
    }

    if (cmd === 'ask' || cmd === 'sor') {
      await handleAskCommand(rest, asJson, lang, cliMsg);
      return;
    }

    if (cmd === 'rm' || cmd === 'del' || cmd === 'sil' || cmd === 'delete') {
      const rawSelectors = parseBatchSelectors(stripOptions(rest));
      if (rawSelectors.length === 0) {
        console.error(msg.selectorRequired);
        process.exit(2);
      }
      const selectors = resolveViewSelectors(rawSelectors, cliMsg, { strictOnExpired: true });
      if (selectors.length > 1) {
        const results = await store.batchDeleteTasks(selectors);
        if (asJson) console.log(JSON.stringify(results, null, 2));
        else {
          for (const r of results) {
            console.log(
              `${c.yellow(msg.trashed)}: ${c.bold(r.title)} ${c.dim(`(${cliMsg.undoHint})`)}`,
            );
          }
        }
        return;
      }
      const removed = await store.deleteTask(selectors[0]);
      if (asJson) console.log(JSON.stringify(removed, null, 2));
      else
        console.log(
          `${c.yellow(msg.trashed)}: ${c.bold(removed.title)} ${c.dim(`(${cliMsg.undoHint})`)}`,
        );
      return;
    }

    const suggestion = suggestCommand(cmd);
    const hint = suggestion
      ? `${cliMsg.didYouMean}: "${suggestion}"? ${msg.helpHint}`
      : msg.helpHint;
    console.error(`${msg.unknownCmd}: "${cmd}". ${hint}`);
    process.exit(2);
  }

  main().catch((err) => {
    if (err && err.code === 'SQLITE_ABI_MISMATCH') {
      process.exit(store.ABI_FALLBACK_EXIT_CODE);
    }
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
})();
