'use strict';

const store = require('../../shared/localStore.cjs');
const cliParser = require('../../shared/cliParser.cjs');
const cliViewState = require('../../shared/cliViewState.cjs');
const { formatMsg } = require('../../shared/cliMessages.cjs');

const IS_STDOUT_TTY =
  process.env.AGENDAMEA_FORCE_TTY === '1'
    ? true
    : process.env.AGENDAMEA_FORCE_TTY === '0'
      ? false
      : Boolean(process.stdout.isTTY);

const IS_STDIN_TTY =
  process.env.AGENDAMEA_STDIN_TTY === '1'
    ? true
    : process.env.AGENDAMEA_STDIN_TTY === '0'
      ? false
      : Boolean(process.stdin.isTTY);

const USE_COLOR =
  !process.env.NO_COLOR &&
  !process.argv.includes('--no-color') &&
  (IS_STDOUT_TTY || process.env.FORCE_COLOR === '1');

const QUIET_MODE = process.argv.includes('--quiet');

const CONFIG_SCHEMA = [
  {
    key: 'language',
    type: 'string',
    def: 'tr',
    desc: 'UI/CLI language code (73 supported, e.g. tr, en, de)',
  },
  { key: 'themeMode', type: 'enum', def: 'light', desc: 'light | dark | system' },
  {
    key: 'themeId',
    type: 'string',
    def: 'obsidian',
    desc: 'Color theme ID (obsidian, blue, emerald, purple, ...)',
  },
  { key: 'appIconId', type: 'string', def: 'match-theme', desc: 'Dynamic desktop/tray icon ID' },
  { key: 'zoomPercent', type: 'number', def: '100', desc: 'UI zoom percentage (80-150)' },
  { key: 'closeBehavior', type: 'enum', def: 'ask', desc: 'ask | tray | quit' },
  {
    key: 'launchAtStartup',
    type: 'boolean',
    def: 'false',
    desc: 'Start Agendamea in tray on Windows sign-in',
  },
  { key: 'highContrast', type: 'boolean', def: 'false', desc: 'High contrast accessibility mode' },
  { key: 'reducedMotion', type: 'boolean', def: 'false', desc: 'Disable non-essential animations' },
  {
    key: 'autoUpdateCheck',
    type: 'boolean',
    def: 'true',
    desc: 'Check GitHub Releases on startup',
  },
  {
    key: 'onedriveAutoSync',
    type: 'boolean',
    def: 'false',
    desc: 'Auto-push JSON snapshots to linked cloud folder',
  },
  { key: 'webhookEnabled', type: 'boolean', def: 'false', desc: 'Enable outgoing webhooks' },
  {
    key: 'webhookUrl',
    type: 'string',
    def: '""',
    desc: 'Comma/newline separated webhook destination URLs',
  },
  {
    key: 'webhookSecret',
    type: 'string',
    def: '""',
    desc: 'Outgoing HMAC / Standard Webhooks signing secret',
  },
  {
    key: 'webhookEvents',
    type: 'string',
    def: '"*"',
    desc: 'Allowed event filter (e.g. todo.created,todo.due)',
  },
  { key: 'webhookFormat', type: 'enum', def: 'auto', desc: 'auto | generic | discord | slack' },
  {
    key: 'webhookIncomingEnabled',
    type: 'boolean',
    def: 'false',
    desc: 'Enable incoming webhook endpoint explicitly',
  },
  {
    key: 'webhookIncomingSecret',
    type: 'string',
    def: '""',
    desc: 'Dedicated incoming webhook secret',
  },
  {
    key: 'webhookAllowLocalNetwork',
    type: 'boolean',
    def: 'true',
    desc: 'Allow localhost/LAN outgoing webhook targets',
  },
  {
    key: 'notificationLeadMinutes',
    type: 'number',
    def: '15',
    desc: 'Upcoming task reminder lead time (1-180 min)',
  },
  {
    key: 'aiEnabled',
    type: 'boolean',
    def: 'false',
    desc: 'Enable local AI voice & assistant features',
  },
  {
    key: 'aiTier',
    type: 'enum',
    def: 'tier-light',
    desc: 'tier-light | tier-medium | tier-strong | external-ollama | external-lmstudio',
  },
];

const ALL_TOP_COMMANDS = [
  'list',
  'bugun',
  'today',
  'onemli',
  'imp',
  'tamam',
  '+',
  'add',
  'ekle',
  'bak',
  'show',
  'edit',
  'duzenle',
  'ok',
  'done',
  'pin',
  'move',
  'rm',
  'sil',
  'ara',
  'find',
  'geri',
  'undo',
  'cop',
  'trash',
  'cat',
  'sub',
  'cal',
  'kanban',
  'matris',
  'matrix',
  'stat',
  'sync',
  'export',
  'import',
  'config',
  'serve',
  'hook',
  'webhook',
  'mcp',
  'ai',
  'ask',
  'rag',
  'completion',
  'doctor',
  'install',
  'uninstall',
  'update',
  'reset',
  'help',
  'version',
];

const c = {
  dim: (s) => (USE_COLOR ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (USE_COLOR ? `\x1b[1m${s}\x1b[0m` : s),
  red: (s) => (USE_COLOR ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s) => (USE_COLOR ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s) => (USE_COLOR ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s) => (USE_COLOR ? `\x1b[36m${s}\x1b[0m` : s),
  magenta: (s) => (USE_COLOR ? `\x1b[35m${s}\x1b[0m` : s),
  strike: (s) => (USE_COLOR ? `\x1b[9m${s}\x1b[0m` : s),
};

function hasAnyFlag(args, names) {
  return args.some((a) => names.includes(a));
}

function getOptionValue(args, names) {
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (names.includes(token) && args[i + 1] !== undefined) {
      return args[i + 1];
    }
    for (const name of names) {
      if (name.startsWith('--') && token.startsWith(`${name}=`)) {
        return token.slice(name.length + 1);
      }
    }
  }
  return null;
}

function stripOptions(args, valueOptionNames = []) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (valueOptionNames.includes(token)) {
      i += 1;
      continue;
    }
    if (valueOptionNames.some((n) => n.startsWith('--') && token.startsWith(`${n}=`))) {
      continue;
    }
    if (token !== '-' && token.startsWith('-')) {
      continue;
    }
    out.push(token);
  }
  return out;
}

function readStdinUtf8() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function parseBatchSelectors(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];
  if (tokens.length === 1 && tokens[0].includes(',')) {
    const parts = tokens[0]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts;
  }
  if (tokens.length > 1 && tokens.every((t) => /^\d+$/.test(t))) {
    return tokens;
  }
  return [tokens.join(' ').trim()];
}

function formatDueBadge(todo, msg) {
  const parts = [];
  const today = store.getTodayStr();
  const tomorrow = store.getTomorrowStr();
  const fmtOne = (d) => {
    if (d === today) return c.cyan(msg.today);
    if (d === tomorrow) return c.dim(msg.tomorrow);
    return d < today ? c.red(d) : c.dim(d);
  };
  if (todo.startDate && todo.dueDate && todo.startDate !== todo.dueDate) {
    parts.push(`${fmtOne(todo.startDate)}-${fmtOne(todo.dueDate)}`);
  } else if (todo.dueDate) {
    parts.push(fmtOne(todo.dueDate));
  } else if (todo.startDate) {
    parts.push(fmtOne(todo.startDate));
  }
  if (todo.dueTime) parts.push(c.cyan(todo.dueTime));
  return parts.length > 0 ? ` · ${parts.join(' ')}` : '';
}

function levenshtein(a, b) {
  const s = String(a || '').toLowerCase();
  const t = String(b || '').toLowerCase();
  if (!s) return t.length;
  if (!t) return s.length;
  const dp = Array.from({ length: s.length + 1 }, () => new Array(t.length + 1).fill(0));
  for (let i = 0; i <= s.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= t.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[s.length][t.length];
}

function suggestCommand(input) {
  const clean = String(input || '')
    .trim()
    .toLowerCase();
  if (!clean) return null;
  let best = null;
  let bestDist = Infinity;
  for (const candidate of ALL_TOP_COMMANDS) {
    if (candidate === '+') continue;
    const dist = levenshtein(clean, candidate);
    const maxAllowed = clean.length <= 3 ? 1 : 2;
    if (dist <= maxAllowed && dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

function getCommandHelp(topic, langOrIsTr, cliMsg) {
  const isTr =
    typeof langOrIsTr === 'boolean'
      ? langOrIsTr
      : String(langOrIsTr || 'en')
          .toLowerCase()
          .startsWith('tr');
  const key = String(topic || '')
    .trim()
    .toLowerCase();
  const map = {
    add: isTr
      ? 'Kullanım: ag + <başlık> [@bugun|@yarin|@cuma|+3g|+1ay|2026-05-01] [14.30|@sabah] [p:yuksek|p:dusuk] [i:] [pin:] [+etiket] [c:"Kat"] [--note ".."] [--sub ".."] [-- ham başlık]\nPipe toplu ekleme: Get-Content gorevler.txt | ag + -'
      : 'Usage: ag + <title> [@today|@tomorrow|@fri|+3d|+1m|2026-05-01] [14.30|@morning] [p:high|p:low] [i:] [pin:] [+tag] [c:"Cat"] [--note ".."] [--sub ".."] [-- raw title]\nStdin batch add: cat tasks.txt | ag + -',
    edit: isTr
      ? 'Kullanım: ag edit <1|kısaId|isim> [--title ".."] [--note ".."] [--due @yarin|none] [--start ..] [--time 15:00|none] [--priority high|normal|low] [--cat ".."] [--tags a,b] [--pin|--unpin]'
      : 'Usage: ag edit <1|shortId|keyword> [--title ".."] [--note ".."] [--due @tomorrow|none] [--start ..] [--time 15:00|none] [--priority high|normal|low] [--cat ".."] [--tags a,b] [--pin|--unpin]',
    ok: isTr
      ? 'Kullanım: ag ok <1 | 1 2 3 | 1,2,3 | kısaId | isim>\nSon listelenen görünümdeki tek veya çoklu görevi tamamlar / yeniden açar.'
      : 'Usage: ag ok <1 | 1 2 3 | 1,2,3 | shortId | keyword>\nToggle completion on one or more tasks from the last displayed view.',
    rm: isTr
      ? 'Kullanım: ag rm <1 | 1 2 3 | 1,2,3 | kısaId | isim>\nGörevi çöp kutusuna taşır (geri almak için: ag geri).'
      : 'Usage: ag rm <1 | 1 2 3 | 1,2,3 | shortId | keyword>\nMove one or more tasks to Trash (undo with: ag undo).',
    bak: isTr
      ? 'Kullanım: ag bak <1|kısaId|isim> [-j]\nGörevin tüm notlarını, alt görevlerini, saat ve etiketlerini gösterir.'
      : 'Usage: ag show <1|shortId|keyword> [-j]\nShow full task details including notes, subtasks, schedule, and tags.',
    ara: isTr
      ? 'Kullanım: ag ara <kelime> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--cat ".."] [--priority high] [-a|--all]'
      : 'Usage: ag find <keyword> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--cat ".."] [--priority high] [-a|--all]',
    mcp: isTr
      ? 'Kullanım:\n  ag mcp                              Stdio MCP sunucusunu başlatır (23 araç, 5 kaynak, 4 prompt)\n  ag mcp list                         Algılanan ve bağlı AI istemcilerini listeler\n  ag mcp install <istemci|--all>      Claude, Cursor, VS Code, Windsurf, Claude Code veya Antigravity kurulumu\n  ag mcp uninstall <istemci>          İstemci yapılandırmasından Agendamea kaydını kaldırır\n  ag mcp doctor                       Canlı stdio handshake öz-testi yapar'
      : 'Usage:\n  ag mcp                              Start stdio MCP server (23 tools, 5 resources, 4 prompts)\n  ag mcp list                         List detected and configured AI MCP clients\n  ag mcp install <client|--all>       Auto-configure Claude, Cursor, VS Code, Windsurf, Claude Code, or Antigravity\n  ag mcp uninstall <client>           Remove Agendamea from client config\n  ag mcp doctor                       Run live stdio JSON-RPC handshake self-test',
    hook: isTr
      ? 'Kullanım:\n  ag hook set <url1,url2> [secret]    Giden webhook hedeflerini kaydeder\n  ag hook events <todo.created,...|*> Gönderilecek olayları filtreler\n  ag hook test [url]                  Test isteği gönderir\n  ag hook logs [limit|clear]          Teslimat geçmişini gösterir veya temizler\n  ag hook outbox [limit]              Bekleyen / başarısız teslimat kuyruğunu listeler\n  ag hook replay <outbox-id>          Başarısız teslimatı tekrar sıraya alır\n  ag hook on | off                    Giden webhookları açar / kapatır'
      : 'Usage:\n  ag hook set <url1,url2> [secret]    Configure outgoing webhook URLs\n  ag hook events <todo.created,...|*> Filter outgoing events\n  ag hook test [url]                  Send a test webhook delivery\n  ag hook logs [limit|clear]          Inspect or clear delivery logs\n  ag hook outbox [limit]              Inspect pending / dead-letter outbox queue\n  ag hook replay <outbox-id>          Queue a failed outbox delivery for immediate retry\n  ag hook on | off                    Enable or disable outgoing webhooks',
    serve: isTr
      ? 'Kullanım: ag serve [start|stop|status] [--port 38721] [--fg]\nArayüz açmadan yerel HTTP API, Gelen Webhook (/api/webhook/incoming) ve Streamable HTTP MCP (/api/mcp) sunucusunu yönetir.'
      : 'Usage: ag serve [start|stop|status] [--port 38721] [--fg]\nManage headless HTTP API, Incoming Webhook (/api/webhook/incoming), and Streamable HTTP MCP (/api/mcp).',
    completion: isTr
      ? 'Kullanım: ag completion [powershell|bash|zsh] [--install] [--profile <dosya>]\nWindows üzerinde --install hem PowerShell 5.1 hem PowerShell 7 profillerini otomatik günceller.'
      : 'Usage: ag completion [powershell|bash|zsh] [--install] [--profile <file>]\nOn Windows, --install automatically updates both Windows PowerShell 5.1 and PowerShell 7 profiles.',
    config: isTr
      ? 'Kullanım: ag config [--list | <anahtar> | <anahtar> <değer>]\nÖrnek: ag config themeMode dark'
      : 'Usage: ag config [--list | <key> | <key> <value>]\nExample: ag config themeMode dark',
    doctor: isTr
      ? 'Kullanım: ag doctor [-j]\nCLI shim (ag.exe), PATH, SQLite veritabanı, sunucu, MCP istemcileri ve Webhook kuyruğunu denetler.'
      : 'Usage: ag doctor [-j]\nCheck CLI shim (ag.exe), PATH, SQLite database, server, MCP clients, and Webhook outbox health.',
    cal: isTr
      ? 'Kullanım: ag cal [--from YYYY-MM-DD] [--to YYYY-MM-DD] [-a|--all]\nGörevleri tarih başlıkları altında 1..N numaralı gösterir (ag ok <N> ile doğrudan seçilebilir).'
      : 'Usage: ag cal [--from YYYY-MM-DD] [--to YYYY-MM-DD] [-a|--all]\nShow chronological calendar agenda numbered 1..N (selectable via ag ok <N>).',
    kanban: isTr
      ? 'Kullanım: ag kanban [priority|status]\nGörevleri sütunlar halinde 1..N numaralı listeler (ag ok <N> ile doğrudan seçilebilir).'
      : 'Usage: ag kanban [priority|status]\nShow Kanban columns numbered 1..N (selectable via ag ok <N>).',
    matris: isTr
      ? 'Kullanım: ag matris\nEisenhower 4 kadranını 1..N numaralı listeler (ag ok <N> ile doğrudan seçilebilir).'
      : 'Usage: ag matrix\nShow Eisenhower 4 quadrants numbered 1..N (selectable via ag ok <N>).',
    sub: isTr
      ? 'Kullanım: ag sub <görev> [+ <başlık> | ok <1|isim> | edit <1|isim> <yeni ad> | rm <1|isim>]'
      : 'Usage: ag sub <task> [+ <title> | ok <1|keyword> | edit <1|keyword> <new title> | rm <1|keyword>]',
    cat: isTr
      ? 'Kullanım: ag cat [+ <ad> [#hex] | edit <1|ad> [--name ..] [--color #..] [--pin] | move <1|ad> <sıra> | rm <1|ad>]'
      : 'Usage: ag cat [+ <name> [#hex] | edit <1|name> [--name ..] [--color #..] [--pin] | move <1|name> <pos> | rm <1|name>]',
    cop: isTr
      ? 'Kullanım: ag cop [-q kelime] [--from ..] [--to ..] | ag cop sil <1|isim> | ag cop bosalt --yes'
      : 'Usage: ag trash [-q word] [--from ..] [--to ..] | ag trash delete <1|keyword> | ag trash empty --yes',
    ai: isTr
      ? 'Kullanım: ag ai [status [--force] | models | download <id|tier> | delete <id|all>]'
      : 'Usage: ag ai [status [--force] | models | download <id|tier> | delete <id|all>]',
    ask: isTr
      ? 'Kullanım: ag ask "<doğal dil soru veya komut>" [--read-only] [--yes] [--confirm-token <token>]'
      : 'Usage: ag ask "<natural language query or command>" [--read-only] [--yes] [--confirm-token <token>]',
    rag: isTr
      ? 'Kullanım: ag rag "<sorgu>" [--top 5] [--min-score 0.35]'
      : 'Usage: ag rag "<query>" [--top 5] [--min-score 0.35]',
    sync: isTr
      ? 'Kullanım: ag sync [status | auto | set <klasör> | pull | off]'
      : 'Usage: ag sync [status | auto | set <folder> | pull | off]',
  };
  const alias = {
    '+': 'add',
    a: 'add',
    ekle: 'add',
    duzenle: 'edit',
    düzenle: 'edit',
    set: 'edit',
    done: 'ok',
    d: 'ok',
    complete: 'ok',
    bitir: 'ok',
    del: 'rm',
    sil: 'rm',
    delete: 'rm',
    show: 'bak',
    info: 'bak',
    detay: 'bak',
    find: 'ara',
    search: 'ara',
    webhook: 'hook',
    server: 'serve',
    daemon: 'serve',
    sunucu: 'serve',
    ayar: 'config',
    settings: 'config',
    saglik: 'doctor',
    sağlık: 'doctor',
    calendar: 'cal',
    takvim: 'cal',
    board: 'kanban',
    pano: 'kanban',
    matrix: 'matris',
    subtask: 'sub',
    alt: 'sub',
    cats: 'cat',
    categories: 'cat',
    kategoriler: 'cat',
    çöp: 'cop',
    trash: 'cop',
    sor: 'ask',
    esitle: 'sync',
    eşitle: 'sync',
  };
  const resolved = alias[key] || key;
  const text = map[resolved] || null;
  if (!text) return null;
  if (!isTr && cliMsg && typeof cliMsg.usagePrefix === 'string' && cliMsg.usagePrefix.trim()) {
    return text.replace(/^Usage:/, `${cliMsg.usagePrefix.trim()}:`);
  }
  return text;
}

function printTaskList(list, msg, categoryMap = new Map(), options = {}) {
  if (options.viewName) {
    const dataDir = store.getCandidateDataDirs()[0];
    cliViewState.saveViewSnapshot(options.viewName, list, { dataDir });
  }
  if (list.length === 0) {
    if (!options.silentEmpty) console.log(c.dim(msg.noTasks));
    return;
  }
  const startIndex =
    typeof options.startIndex === 'number' && options.startIndex > 0 ? options.startIndex : 1;
  const padWidth =
    typeof options.padWidth === 'number' && options.padWidth > 0
      ? options.padWidth
      : String(startIndex + list.length - 1).length;
  list.forEach((todo, index) => {
    const num = c.dim(`${String(startIndex + index).padStart(padWidth, ' ')}.`);
    const shortId = c.dim(`[${cliViewState.computeShortId(todo.id)}]`);
    const mark = todo.completed ? c.green('[x]') : '[ ]';
    const pin = todo.pinned ? c.magenta('^') : '';
    const star = todo.important ? c.yellow('*') : ' ';
    const pri = todo.priority === 'high' ? c.red('!') : todo.priority === 'low' ? c.dim('-') : ' ';
    const title = todo.completed ? c.dim(c.strike(todo.title)) : c.bold(todo.title);
    const due = formatDueBadge(todo, msg);
    const catName =
      todo.categoryId && categoryMap.get(todo.categoryId)
        ? c.dim(` [${categoryMap.get(todo.categoryId)}]`)
        : '';
    const subs =
      Array.isArray(todo.subtasks) && todo.subtasks.length > 0
        ? c.dim(` (${todo.subtasks.filter((s) => s.completed).length}/${todo.subtasks.length})`)
        : '';
    const tags =
      Array.isArray(todo.tags) && todo.tags.length > 0
        ? `  ${todo.tags.map((tg) => c.cyan(`#${tg}`)).join(' ')}`
        : '';
    console.log(
      `${num} ${shortId} ${mark} ${pin}${star}${pri} ${title}${due}${catName}${subs}${tags}`,
    );
  });
}

function resolveViewSelectors(selectors, cliMsg, options = {}) {
  const dataDir = store.getCandidateDataDirs()[0];
  const strict = Boolean(options.strictOnExpired);
  return selectors.map((sel) => {
    const clean = String(sel || '').trim();
    if (!/^\d+$/.test(clean)) return clean;
    const resolved = cliViewState.resolveNumericFromSnapshot(clean, { dataDir });
    if (resolved.matched) return resolved.id;
    if (resolved.expired && strict) {
      console.error(c.yellow(formatMsg(cliMsg.viewExpiredWarn, { min: resolved.ageMinutes })));
      process.exit(2);
    }
    if (resolved.outOfRange && strict) {
      console.error(
        c.red(
          formatMsg(cliMsg.viewOutOfRange, {
            idx: clean,
            view: resolved.viewName,
            max: resolved.maxIndex,
          }),
        ),
      );
      process.exit(2);
    }
    return clean;
  });
}

function parseNaturalTaskTokens(tokens, isEdit = false) {
  let startDate;
  let dueDate;
  let dueTime;
  let explicitPriority = null;
  let notes;
  let category;
  let explicitTitle;
  const flagTags = [];
  const flagSubtasks = [];
  const passthroughTokens = [];

  let rawStopSeen = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (rawStopSeen) {
      passthroughTokens.push(token);
      continue;
    }
    if (token === '--') {
      rawStopSeen = true;
      passthroughTokens.push(token);
      continue;
    }
    if (token === '-j' || token === '--json' || token === '--no-color' || token === '--quiet')
      continue;
    if (token === '--title' && tokens[i + 1] !== undefined) {
      explicitTitle = tokens[i + 1];
      i += 1;
    } else if (token.startsWith('--title=')) {
      explicitTitle = token.slice('--title='.length);
    } else if (
      (token === '--note' || token === '--notes' || token === '-n') &&
      tokens[i + 1] !== undefined
    ) {
      notes = tokens[i + 1];
      i += 1;
    } else if (token.startsWith('--note=')) {
      notes = token.slice('--note='.length);
    } else if ((token === '--due' || token === '-d') && tokens[i + 1] !== undefined) {
      const v = tokens[i + 1];
      dueDate = v === 'none' || v === '' ? null : cliParser.resolveDateToken(v) || v;
      i += 1;
    } else if (token.startsWith('--due=')) {
      const v = token.slice('--due='.length);
      dueDate = v === 'none' || v === '' ? null : cliParser.resolveDateToken(v) || v;
    } else if (token === '--start' && tokens[i + 1] !== undefined) {
      const v = tokens[i + 1];
      startDate = v === 'none' || v === '' ? null : cliParser.resolveDateToken(v) || v;
      i += 1;
    } else if (token.startsWith('--start=')) {
      const v = token.slice('--start='.length);
      startDate = v === 'none' || v === '' ? null : cliParser.resolveDateToken(v) || v;
    } else if (token === '--time' && tokens[i + 1] !== undefined) {
      const v = tokens[i + 1];
      dueTime = v === 'none' || v === '' ? null : cliParser.normalizeTimeToken(v) || v;
      i += 1;
    } else if (token.startsWith('--time=')) {
      const v = token.slice('--time='.length);
      dueTime = v === 'none' || v === '' ? null : cliParser.normalizeTimeToken(v) || v;
    } else if ((token === '--priority' || token === '-p') && tokens[i + 1] !== undefined) {
      explicitPriority = tokens[i + 1].toLowerCase();
      i += 1;
    } else if (token.startsWith('--priority=')) {
      explicitPriority = token.slice('--priority='.length).toLowerCase();
    } else if ((token === '--cat' || token === '--category') && tokens[i + 1] !== undefined) {
      category = tokens[i + 1] === 'none' ? '' : tokens[i + 1];
      i += 1;
    } else if (token.startsWith('--cat=')) {
      const v = token.slice('--cat='.length);
      category = v === 'none' ? '' : v;
    } else if (token === '--sub' && tokens[i + 1] !== undefined) {
      flagSubtasks.push(tokens[i + 1]);
      i += 1;
    } else if (token.startsWith('--sub=')) {
      flagSubtasks.push(token.slice('--sub='.length));
    } else if (token === '--tags' && tokens[i + 1] !== undefined) {
      for (const tg of tokens[i + 1]
        .split(',')
        .map((x) => x.trim().replace(/^[#+]+/, ''))
        .filter(Boolean)) {
        flagTags.push(tg);
      }
      i += 1;
    } else if (token === '--tag' && tokens[i + 1] !== undefined) {
      const clean = tokens[i + 1].trim().replace(/^[#+]+/, '');
      if (clean) flagTags.push(clean);
      i += 1;
    } else if (
      token === '-t' ||
      token === '--today' ||
      token === '-h' ||
      token === '--high' ||
      token === '-l' ||
      token === '--low' ||
      token === '-i' ||
      token === '--important' ||
      token === '--no-important' ||
      token === '--pin' ||
      token === '--unpin' ||
      token === '--clear-tags'
    ) {
      // Handled below via explicit flags
    } else {
      passthroughTokens.push(token);
    }
  }

  const parsedCore = cliParser.parseQuickTaskTokens(passthroughTokens);

  if (startDate === undefined && parsedCore.startDate) startDate = parsedCore.startDate;
  if (dueDate === undefined && parsedCore.dueDate) dueDate = parsedCore.dueDate;
  if (dueTime === undefined && parsedCore.dueTime) dueTime = parsedCore.dueTime;
  if (category === undefined && parsedCore.category) category = parsedCore.category;
  if (notes === undefined && parsedCore.notes) notes = parsedCore.notes;

  if (hasAnyFlag(tokens, ['-t', '--today']) && dueDate === undefined) {
    dueDate = store.getTodayStr();
  }

  let priority;
  if (
    explicitPriority === 'high' ||
    explicitPriority === 'yuksek' ||
    explicitPriority === 'yüksek'
  ) {
    priority = 'high';
  } else if (
    explicitPriority === 'low' ||
    explicitPriority === 'dusuk' ||
    explicitPriority === 'düşük'
  ) {
    priority = 'low';
  } else if (explicitPriority === 'normal') {
    priority = 'normal';
  } else if (parsedCore.priority !== 'normal') {
    priority = parsedCore.priority;
  } else if (hasAnyFlag(tokens, ['-h', '--high', '-H'])) {
    priority = 'high';
  } else if (hasAnyFlag(tokens, ['-l', '--low', '-L'])) {
    priority = 'low';
  } else if (!isEdit) {
    priority = 'normal';
  }

  const important =
    parsedCore.important || hasAnyFlag(tokens, ['-i', '--important', '-I'])
      ? true
      : hasAnyFlag(tokens, ['--no-important'])
        ? false
        : isEdit
          ? undefined
          : false;

  const pinned =
    parsedCore.pinned || hasAnyFlag(tokens, ['--pin'])
      ? true
      : hasAnyFlag(tokens, ['--unpin'])
        ? false
        : isEdit
          ? undefined
          : false;

  const mergedTags = Array.from(new Set([...flagTags, ...parsedCore.tags]));
  const mergedSubtasks = [...flagSubtasks, ...parsedCore.subtasks];

  return {
    title: explicitTitle !== undefined ? explicitTitle : parsedCore.title,
    notes,
    startDate,
    dueDate,
    dueTime,
    priority,
    important,
    pinned,
    tags: mergedTags.length > 0 || hasAnyFlag(tokens, ['--clear-tags']) ? mergedTags : undefined,
    category,
    subtasks: mergedSubtasks,
  };
}

function parseSettingValue(raw) {
  const lower = String(raw).trim().toLowerCase();
  if (lower === 'true' || lower === 'on' || lower === '1' || lower === 'acik' || lower === 'açık') {
    return true;
  }
  if (
    lower === 'false' ||
    lower === 'off' ||
    lower === '0' ||
    lower === 'kapali' ||
    lower === 'kapalı'
  ) {
    return false;
  }
  if (/^\d+$/.test(lower)) return Number.parseInt(lower, 10);
  return raw;
}

module.exports = {
  IS_STDOUT_TTY,
  IS_STDIN_TTY,
  USE_COLOR,
  QUIET_MODE,
  CONFIG_SCHEMA,
  ALL_TOP_COMMANDS,
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
  parseSettingValue,
};
