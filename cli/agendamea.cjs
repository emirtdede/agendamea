#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const store = require('../shared/localStore.cjs');

const USE_COLOR =
  !process.env.NO_COLOR && (Boolean(process.stdout.isTTY) || process.env.FORCE_COLOR === '1');

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

const LABELS = {
  tr: {
    added: 'Eklendi',
    updated: 'Güncellendi',
    completed: 'Tamamlandı',
    reopened: 'Yeniden açıldı',
    pinned: 'Sabitlendi',
    unpinned: 'Sabitleme kaldırıldı',
    trashed: 'Çöp kutusuna taşındı',
    restored: 'geri yüklendi',
    permDeleted: 'Kalıcı olarak silindi',
    trashEmptied: 'Çöp kutusu boşaltıldı',
    clearedDone: 'Tamamlananlar çöpe taşındı',
    moved: 'Sıralama güncellendi',
    catAdded: 'Kategori oluşturuldu',
    catUpdated: 'Kategori güncellendi',
    catTrashed: 'Kategori çöpe taşındı',
    subAdded: 'Alt görev eklendi',
    subUpdated: 'Alt görev güncellendi',
    subDeleted: 'Alt görev silindi',
    exported: 'Yedek dışa aktarıldı',
    imported: 'Yedek geri yüklendi',
    synced: 'Bulut eşitleme tamamlandı',
    cloudPulled: 'Bulut yedeği geri yüklendi',
    cloudConnected: 'Bulut klasörü bağlandı',
    cloudDisconnected: 'Bulut bağlantısı kesildi',
    serverStarted: 'Arayüzsüz sunucu başlatıldı',
    serverStopped: 'Arayüzsüz sunucu durduruldu',
    serverNotRunning: 'Çalışan sunucu yok.',
    cliInstalled: 'CLI PATH kurulumu tamamlandı',
    cliUninstalled: 'CLI PATH kaldırıldı',
    logsEmpty: 'Henüz webhook kaydı yok.',
    logsCleared: 'Webhook kayıtları temizlendi',
    undated: 'Tarihsiz',
    updateAvailable: 'Yeni sürüm mevcut',
    upToDate: 'Uygulama güncel',
    resetDone: 'Tüm veriler sıfırlandı',
    configSaved: 'Ayar kaydedildi',
    noTasks: 'Eşleşen görev bulunamadı.',
    noCategories: 'Henüz kategori yok.',
    trashEmpty: 'Çöp kutusu boş.',
    today: 'Bugün',
    tomorrow: 'Yarın',
    active: 'Aktif',
    important: 'Önemli',
    done: 'Tamamlanan',
    categories: 'Kategoriler',
    tasks: 'Görevler',
    trash: 'Çöp Kutusu',
    notes: 'Notlar',
    subtasks: 'Alt Görevler',
    category: 'Kategori',
    priority: 'Öncelik',
    schedule: 'Tarih',
    modeLive: 'Canlı',
    modeOffline: 'Çevrimdışı',
    q1: 'I · Önemli ve Acil (Bugün)',
    q2: 'II · Önemli ve Planlı',
    q3: 'III · Normal ve Bugün',
    q4: 'IV · Düşük Öncelik / Sonra',
    titleRequired: 'Görev başlığı gerekli. Örnek: ag + Sunumu hazırla @bugun !',
    selectorRequired: 'Görev numarası veya ismi gerekli. Örnek: ag ok 1',
    searchRequired: 'Aranacak kelime gerekli. Örnek: ag ara fatura',
    confirmYesRequired: 'Kalıcı işlem için --yes bayrağı gerekli.',
    webhookOk: 'Webhook bağlantısı başarılı',
    webhookFail: 'Webhook başarısız',
    unknownCmd: 'Bilinmeyen komut',
    helpHint: 'Kullanım için "ag help" (tüm komutlar: "ag help all") yazın.',
    shortHelp: `Agendamea CLI v${store.APP_VERSION} (kısayollar: ag | agenda | agendamea)

Günlük Hızlı Komutlar (tırnak gerekmez):
  ag                                 Aktif görevleri 1, 2, 3 diye listeler
  ag + Sunumu hazırla @bugun ! #iş   Yeni görev ekler (@yarin, 14:30, !, *, ^, /Kategori)
  ag bak 1                           1 numaralı görevin tüm detaylarını (not + alt görev) gösterir
  ag ok 1                            1 numaralı (veya ismi eşleşen) görevi tamamlar
  ag rm 2                            2 numaralı görevi çöp kutusuna taşır
  ag ara fatura                      Başlık, not, alt görev ve #etiketlerde arar
  ag geri                            Çöp kutusundaki son öğeyi geri yükler
  ag stat                            Özet durumu gösterir

Otomasyon ve Tam Arayüzsüz Kontrol:
  ag serve [start|stop|status]       Arayüz açmadan yerel API + Gelen Webhook sunucusunu başlatır
  ag hook [logs|set <url>|events]    Webhook test, kayıt geçmişi ve olay filtresi
  ag mcp                             20 araçlı yapay zeka MCP sunucusunu başlatır
  ag install                         ag / agenda / agendamea komutlarını PATH'e kurar
  ag help all                        Tüm komutlar (edit, sub, cat, cop, cal, kanban, matris, move, sync, config, reset)`,
    fullHelp: `Agendamea CLI v${store.APP_VERSION} - %100 Arayüzsüz Tam Kontrol

GÖREVLER:
  ag [bugun|onemli|tamam|/Kategori]  Görevleri listeler (--from, --to, --tag, --priority, --sort)
  ag + <başlık> [@bugun|@yarin|@YYYY-MM-DD|@s..e] [HH:mm] [!] [*] [^] [#tag] [/Kat] [--note ".."] [--sub ".."]
  ag + -                             Standart girdiden (pipe) satır satır toplu görev ekler
  ag bak <1|isim|id>                 Notlar, alt görevler, saat ve etiketlerle tam detay
  ag edit <1|isim|id> [alanlar]      Düzenle (--title --note --due --start --time --priority --cat --tags)
  ag ok <1|1 2 3|isim>               Tek veya çoklu görevi tamamlar / geri açar
  ag pin <1|1 2|isim>                Sabitle / sabitlemeyi kaldır
  ag move <1|isim|id> <sıra>         Görevi listede istenen sıraya taşır
  ag rm <1|1 2 3|isim>               Tek veya çoklu görevi çöp kutusuna taşır
  ag ara <kelime> [--from --to]      Başlık, not, alt görev ve #etiket araması
  ag temizle [Kategori]              Tamamlananları çöp kutusuna taşır

GÖRÜNÜMLER (TAKVİM, KANBAN, MATRİS):
  ag cal [--from --to]               Tarih sırasına göre takvim gündemi
  ag kanban [priority|status]        Öncelik veya durum sütunlu Kanban görünümü
  ag matris                          Eisenhower 4 kadran görünümü

ALT GÖREVLER (SUBTASKS):
  ag sub <görev>                     Görevin alt görevlerini listeler
  ag sub <görev> + <alt başlık>      Alt görev ekler
  ag sub <görev> ok <1|isim>         Alt görevi tamamlar / açar
  ag sub <görev> edit <1|isim> <ad>  Alt görevin başlığını değiştirir
  ag sub <görev> rm <1|isim>         Alt görevi siler

KATEGORİLER:
  ag cat                             Kategorileri aktif görev sayılarıyla listeler
  ag cat + <ad> [#renk]              Yeni kategori oluşturur
  ag cat edit <1|ad> [--name ..] [--color #..] [--pin]
  ag cat move <1|ad> <sıra>          Kategoriyi istenen sıraya taşır
  ag cat rm <1|ad>                   Kategoriyi çöp kutusuna taşır

ÇÖP KUTUSU:
  ag cop [-q kelime] [--from --to]   Çöp kutusunu listeler / filtreler
  ag geri [1|isim]                   Son silinen (veya seçili) öğeyi geri yükler
  ag cop sil <1|isim>                Çöpten kalıcı olarak siler
  ag cop bosalt --yes                Çöp kutusunu tamamen boşaltır

YEDEKLEME, BULUT, SUNUCU, WEBHOOK, AYARLAR & MCP:
  ag export [yedek.json]             JSON yedeği oluşturur
  ag import <yedek.json|->           JSON yedeğini dosyadan veya stdin'den atomik geri yükler
  ag sync [auto|status|set <yol>|pull|off] Bulut klasör eşitleme ve otomatik algılama
  ag reset --yes [--all]             Verileri sıfırlar (--all ayarları da sıfırlar)
  ag config [anahtar değer]          Tüm ayarları okur/günceller (OS tercihleri + ikon dahil)
  ag serve [start|stop|status] [--port N] [--fg] Arayüzsüz API + Gelen Webhook sunucusu
  ag hook [set <url1,url2> [secret]|events <..>|logs [clear]|on|off] Webhook ve teslimat günlüğü
  ag install / ag uninstall          Arayüz açmadan PATH kurulumu ve kaldırma
  ag update                          Yeni sürüm denetimi
  ag mcp                             20 araçlı tam MCP sunucusunu başlatır
  -j, --json                         Her komutta ham JSON çıktı verir`,
  },
  en: {
    added: 'Added',
    updated: 'Updated',
    completed: 'Completed',
    reopened: 'Reopened',
    pinned: 'Pinned',
    unpinned: 'Unpinned',
    trashed: 'Moved to Trash',
    restored: 'restored',
    permDeleted: 'Permanently deleted',
    trashEmptied: 'Trash emptied',
    clearedDone: 'Completed tasks moved to Trash',
    moved: 'Order updated',
    catAdded: 'Category created',
    catUpdated: 'Category updated',
    catTrashed: 'Category moved to Trash',
    subAdded: 'Subtask added',
    subUpdated: 'Subtask updated',
    subDeleted: 'Subtask deleted',
    exported: 'Backup exported',
    imported: 'Backup restored',
    synced: 'Cloud sync completed',
    cloudPulled: 'Cloud backup restored',
    cloudConnected: 'Cloud folder connected',
    cloudDisconnected: 'Cloud folder disconnected',
    serverStarted: 'Headless server started',
    serverStopped: 'Headless server stopped',
    serverNotRunning: 'No running server.',
    cliInstalled: 'CLI installed to PATH',
    cliUninstalled: 'CLI removed from PATH',
    logsEmpty: 'No webhook logs yet.',
    logsCleared: 'Webhook logs cleared',
    undated: 'Undated',
    updateAvailable: 'Update available',
    upToDate: 'Up to date',
    resetDone: 'All data cleared',
    configSaved: 'Setting saved',
    noTasks: 'No tasks matched.',
    noCategories: 'No categories found.',
    trashEmpty: 'Trash is empty.',
    today: 'Today',
    tomorrow: 'Tomorrow',
    active: 'Active',
    important: 'Important',
    done: 'Completed',
    categories: 'Categories',
    tasks: 'Tasks',
    trash: 'Trash',
    notes: 'Notes',
    subtasks: 'Subtasks',
    category: 'Category',
    priority: 'Priority',
    schedule: 'Schedule',
    modeLive: 'Live',
    modeOffline: 'Offline',
    q1: 'I · Urgent & Important (Today)',
    q2: 'II · Important & Scheduled',
    q3: 'III · Normal & Today',
    q4: 'IV · Low Priority / Later',
    titleRequired: 'Task title is required. Example: ag + Prepare deck @today !',
    selectorRequired: 'Task number or keyword is required. Example: ag ok 1',
    searchRequired: 'Search keyword is required. Example: ag find invoice',
    confirmYesRequired: 'Pass --yes to confirm permanent action.',
    webhookOk: 'Webhook OK',
    webhookFail: 'Webhook failed',
    unknownCmd: 'Unknown command',
    helpHint: 'Run "ag help" (all commands: "ag help all") for usage.',
    shortHelp: `Agendamea CLI v${store.APP_VERSION} (aliases: ag | agenda | agendamea)

Daily Short Commands (no quotes needed):
  ag                                 List active tasks numbered 1, 2, 3
  ag + Prepare deck @today ! #work   Add a task (@tomorrow, 14:30, !, *, ^, /Category)
  ag show 1                          View full task details (notes + subtasks)
  ag ok 1                            Complete task #1 (or by keyword)
  ag rm 2                            Move task #2 to Trash
  ag find invoice                    Search titles, notes, subtasks, and #tags
  ag undo                            Restore last deleted item from Trash
  ag stat                            Show summary

Automation & Full Headless Control:
  ag serve [start|stop|status]       Start headless local API + Incoming Webhook server without GUI
  ag hook [logs|set <url>|events]    Test webhooks, view delivery logs, and filter events
  ag mcp                             Start full 20-tool MCP server over stdio
  ag install                         Install ag / agenda / agendamea to user PATH without GUI
  ag help all                        All commands (edit, sub, cat, trash, cal, kanban, matrix, move, sync, config, reset)`,
    fullHelp: `Agendamea CLI v${store.APP_VERSION} - 100% Headless Full Control

TASKS:
  ag [today|imp|done|/Category]      List tasks (--from, --to, --tag, --priority, --sort)
  ag + <title> [@today|@tomorrow|@YYYY-MM-DD|@s..e] [HH:mm] [!] [*] [^] [#tag] [/Cat] [--note ".."] [--sub ".."]
  ag + -                             Batch-add tasks line-by-line from stdin pipe
  ag show <1|keyword|id>             Full task detail view with notes & subtasks
  ag edit <1|keyword|id> [fields]    Edit (--title --note --due --start --time --priority --cat --tags)
  ag ok <1|1 2 3|keyword>            Complete / reopen single or multiple tasks
  ag pin <1|1 2|keyword>             Pin / unpin single or multiple tasks
  ag move <1|keyword|id> <pos>       Move a task to a 1-based position
  ag rm <1|1 2 3|keyword>            Move single or multiple tasks to Trash
  ag find <keyword> [--from --to]    Search titles, notes, subtasks, and #tags
  ag clear-done [Category]           Move completed tasks to Trash

VIEWS (CALENDAR, KANBAN, MATRIX):
  ag cal [--from --to]               Chronological calendar agenda grouped by date
  ag kanban [priority|status]        Kanban columns by priority or status
  ag matrix                          Eisenhower 4-quadrant overview

SUBTASKS:
  ag sub <task>                      List subtasks for a task
  ag sub <task> + <title>            Add a subtask
  ag sub <task> ok <1|keyword>       Toggle a subtask complete
  ag sub <task> edit <1|key> <title> Rename a subtask
  ag sub <task> rm <1|keyword>       Delete a subtask

CATEGORIES:
  ag cat                             List categories with active task counts
  ag cat + <name> [#hex]             Create a category
  ag cat edit <1|name> [--name ..] [--color #..] [--pin]
  ag cat move <1|name> <pos>         Move category to a 1-based position
  ag cat rm <1|name>                 Move category to Trash

TRASH:
  ag trash [-q word] [--from --to]   List / filter trashed tasks & categories
  ag undo [1|keyword]                Restore last (or matching) item from Trash
  ag trash delete <1|keyword>        Permanently delete a trashed item
  ag trash empty --yes               Empty entire Trash

BACKUP, CLOUD, SERVER, WEBHOOKS, SETTINGS & MCP:
  ag export [backup.json]            Export JSON backup
  ag import <backup.json|->          Atomically restore JSON backup from file or stdin
  ag sync [auto|status|set <dir>|pull|off] Cloud folder sync & provider auto-detection
  ag reset --yes [--all]             Clear all data (--all resets preferences too)
  ag config [key value]              Inspect/update any preference (incl. OS prefs & .ico)
  ag serve [start|stop|status] [--port N] [--fg] Headless API & Incoming Webhook server
  ag hook [set <url1,url2> [secret]|events <..>|logs [clear]|on|off] Webhooks & delivery logs
  ag install / ag uninstall          Zero-GUI PATH installation & removal
  ag update                          Check GitHub Releases for updates
  ag mcp                             Start full 20-tool MCP server over stdio
  -j, --json                         Output raw JSON for any command`,
  },
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
  // Comma-separated numbers/selectors (e.g. "1,2,3")
  if (tokens.length === 1 && tokens[0].includes(',')) {
    const parts = tokens[0].split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }
  // Multiple numeric selectors (e.g. "1 2 3")
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

function printTaskList(list, msg, categoryMap = new Map()) {
  if (list.length === 0) {
    console.log(c.dim(msg.noTasks));
    return;
  }
  const padWidth = String(list.length).length;
  list.forEach((todo, index) => {
    const num = c.dim(`${String(index + 1).padStart(padWidth, ' ')}.`);
    const mark = todo.completed ? c.green('[x]') : '[ ]';
    const pin = todo.pinned ? c.magenta('^') : '';
    const star = todo.important ? c.yellow('*') : ' ';
    const pri = todo.priority === 'high' ? c.red('!') : todo.priority === 'low' ? c.dim('-') : ' ';
    const title = todo.completed ? c.dim(c.strike(todo.title)) : c.bold(todo.title);
    const due = formatDueBadge(todo, msg);
    const catName = todo.categoryId && categoryMap.get(todo.categoryId) ? c.dim(` [${categoryMap.get(todo.categoryId)}]`) : '';
    const subs = Array.isArray(todo.subtasks) && todo.subtasks.length > 0
      ? c.dim(` (${todo.subtasks.filter((s) => s.completed).length}/${todo.subtasks.length})`)
      : '';
    const tags =
      Array.isArray(todo.tags) && todo.tags.length > 0
        ? `  ${todo.tags.map((tg) => c.cyan(`#${tg}`)).join(' ')}`
        : '';
    console.log(`${num} ${mark} ${pin}${star}${pri} ${title}${due}${catName}${subs}${tags}`);
  });
}

function parseNaturalTaskTokens(tokens, isEdit = false) {
  let startDate = undefined;
  let dueDate = undefined;
  let dueTime = undefined;
  let explicitPriority = null;
  let naturalHigh = false;
  let naturalImportant = false;
  let naturalPinned = false;
  let notes = undefined;
  let category = undefined;
  let explicitTitle = undefined;
  const tags = [];
  const subtasks = [];
  const titleParts = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const lower = token.toLowerCase();

    if ((token === '--title') && tokens[i + 1] !== undefined) {
      explicitTitle = tokens[i + 1];
      i += 1;
    } else if (token.startsWith('--title=')) {
      explicitTitle = token.slice('--title='.length);
    } else if ((token === '--note' || token === '--notes' || token === '-n') && tokens[i + 1] !== undefined) {
      notes = tokens[i + 1];
      i += 1;
    } else if (token.startsWith('--note=')) {
      notes = token.slice('--note='.length);
    } else if ((token === '--due' || token === '-d') && tokens[i + 1] !== undefined) {
      dueDate = tokens[i + 1] === 'none' || tokens[i + 1] === '' ? null : tokens[i + 1];
      i += 1;
    } else if (token.startsWith('--due=')) {
      const v = token.slice('--due='.length);
      dueDate = v === 'none' || v === '' ? null : v;
    } else if (token === '--start' && tokens[i + 1] !== undefined) {
      startDate = tokens[i + 1] === 'none' || tokens[i + 1] === '' ? null : tokens[i + 1];
      i += 1;
    } else if (token.startsWith('--start=')) {
      const v = token.slice('--start='.length);
      startDate = v === 'none' || v === '' ? null : v;
    } else if (token === '--time' && tokens[i + 1] !== undefined) {
      dueTime = tokens[i + 1] === 'none' || tokens[i + 1] === '' ? null : tokens[i + 1];
      i += 1;
    } else if (token.startsWith('--time=')) {
      const v = token.slice('--time='.length);
      dueTime = v === 'none' || v === '' ? null : v;
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
      subtasks.push(tokens[i + 1]);
      i += 1;
    } else if (token.startsWith('--sub=')) {
      subtasks.push(token.slice('--sub='.length));
    } else if (token === '--tags' && tokens[i + 1] !== undefined) {
      tokens[i + 1]
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((tg) => tags.push(tg));
      i += 1;
    } else if (token === '!') {
      naturalHigh = true;
    } else if (token === '*') {
      naturalImportant = true;
    } else if (token === '^') {
      naturalPinned = true;
    } else if (lower === '@bugun' || lower === '@bugün' || lower === '@today') {
      dueDate = store.getTodayStr();
    } else if (lower === '@yarin' || lower === '@yarın' || lower === '@tomorrow') {
      dueDate = store.getTomorrowStr();
    } else if (/^@\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(token)) {
      const [s, e] = token.slice(1).split('..');
      startDate = s;
      dueDate = e;
    } else if (/^@\d{4}-\d{2}-\d{2}$/.test(token)) {
      dueDate = token.slice(1);
    } else if (/^@?([01]\d|2[0-3]):[0-5]\d$/.test(token)) {
      dueTime = token.startsWith('@') ? token.slice(1) : token;
    } else if (/^#[^\s#]+$/.test(token)) {
      tags.push(token.slice(1));
    } else if (/^\/[^\s/]+$/.test(token)) {
      category = token.slice(1);
    } else if (token === '-' || !token.startsWith('-')) {
      titleParts.push(token);
    }
  }

  if (hasAnyFlag(tokens, ['-t', '--today']) && dueDate === undefined) {
    dueDate = store.getTodayStr();
  }

  let priority = undefined;
  if (explicitPriority === 'high' || explicitPriority === 'low' || explicitPriority === 'normal') {
    priority = explicitPriority;
  } else if (naturalHigh || hasAnyFlag(tokens, ['-h', '--high'])) {
    priority = 'high';
  } else if (hasAnyFlag(tokens, ['-l', '--low'])) {
    priority = 'low';
  } else if (!isEdit) {
    priority = 'normal';
  }

  const important =
    naturalImportant || hasAnyFlag(tokens, ['-i', '--important'])
      ? true
      : hasAnyFlag(tokens, ['--no-important'])
        ? false
        : isEdit
          ? undefined
          : false;

  const pinned =
    naturalPinned || hasAnyFlag(tokens, ['--pin'])
      ? true
      : hasAnyFlag(tokens, ['--unpin'])
        ? false
        : isEdit
          ? undefined
          : false;

  return {
    title: explicitTitle !== undefined ? explicitTitle : titleParts.join(' ').trim(),
    notes,
    startDate,
    dueDate,
    dueTime,
    priority,
    important,
    pinned,
    tags: tags.length > 0 || hasAnyFlag(tokens, ['--clear-tags']) ? tags : undefined,
    category,
    subtasks,
  };
}

function parseSettingValue(raw) {
  const lower = String(raw).trim().toLowerCase();
  if (lower === 'true' || lower === 'on' || lower === '1' || lower === 'acik' || lower === 'açık') {
    return true;
  }
  if (lower === 'false' || lower === 'off' || lower === '0' || lower === 'kapali' || lower === 'kapalı') {
    return false;
  }
  if (/^\d+$/.test(lower)) return Number.parseInt(lower, 10);
  return raw;
}

async function main() {
  const args = process.argv.slice(2);
  const firstArg = args[0] || '';
  const asJson = hasAnyFlag(args, ['-j', '--json']);

  if (firstArg === '-v' || firstArg === '--version' || firstArg.toLowerCase() === 'version') {
    console.log(`agendamea ${store.APP_VERSION}`);
    return;
  }

  if (firstArg.toLowerCase() === 'mcp') {
    const mcpScript = path.resolve(__dirname, '..', 'mcp', 'server.cjs');
    const child = spawn(process.execPath, [mcpScript], {
      stdio: 'inherit',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    child.on('exit', (code) => process.exit(code ?? 0));
    return;
  }

  const lang = await store.getPreferredLanguage();
  const msg = lang.startsWith('tr') ? LABELS.tr : LABELS.en;

  const isCategoryFilterShortcut = firstArg.startsWith('/') && firstArg.length > 1;
  const cmd = isCategoryFilterShortcut
    ? 'list'
    : !firstArg || firstArg.startsWith('-')
      ? firstArg === '-h' || firstArg === '--help'
        ? 'help'
        : 'list'
      : firstArg.toLowerCase();
  const rest = isCategoryFilterShortcut || !firstArg || firstArg.startsWith('-') ? args : args.slice(1);

  if (cmd === 'help' || cmd === 'yardim' || cmd === 'yardım') {
    const showAll = rest.some((r) => ['all', 'tumu', 'tümü', 'full'].includes(r.toLowerCase()));
    console.log(showAll ? msg.fullHelp : msg.shortHelp);
    return;
  }

  if (cmd === 'stat' || cmd === 'status' || cmd === 'durum') {
    const summary = await store.getStatus();
    if (asJson) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      const modeLabel = summary.mode === 'live-api' ? c.green(msg.modeLive) : c.yellow(msg.modeOffline);
      console.log(`${c.bold(`Agendamea v${summary.version}`)} [${modeLabel}] ${c.dim(summary.endpoint)}`);
      console.log(
        `${msg.active}: ${c.bold(String(summary.activeTasks))} | ${msg.today}: ${c.cyan(String(summary.dueToday))} | ${msg.important}: ${c.yellow(String(summary.important))} | ${msg.done}: ${c.green(String(summary.completedTasks))} | ${msg.categories}: ${summary.categories} | ${msg.trash}: ${summary.trashCount}`,
      );
    }
    return;
  }

  if (cmd === 'matris' || cmd === 'matrix') {
    const matrix = await store.getMatrix();
    if (asJson) {
      console.log(JSON.stringify(matrix, null, 2));
      return;
    }
    const sections = [
      [msg.q1, matrix.q1],
      [msg.q2, matrix.q2],
      [msg.q3, matrix.q3],
      [msg.q4, matrix.q4],
    ];
    for (const [heading, items] of sections) {
      console.log(`\n${c.bold(heading)} ${c.dim(`(${items.length})`)}`);
      printTaskList(items, msg);
    }
    return;
  }

  if (cmd === 'cal' || cmd === 'calendar' || cmd === 'takvim') {
    const dateFrom = getOptionValue(rest, ['--from']);
    const dateTo = getOptionValue(rest, ['--to']);
    const includeCompleted = hasAnyFlag(rest, ['-a', '--all']);
    const agenda = await store.getCalendarAgenda({ dateFrom, dateTo, includeCompleted });
    if (asJson) {
      console.log(JSON.stringify(agenda, null, 2));
      return;
    }
    const keys = Object.keys(agenda.grouped);
    if (keys.length === 0 && agenda.undated.length === 0) {
      console.log(c.dim(msg.noTasks));
      return;
    }
    for (const day of keys) {
      console.log(`\n${c.bold(day)} ${c.dim(`(${agenda.grouped[day].length})`)}`);
      printTaskList(agenda.grouped[day], msg);
    }
    if (agenda.undated.length > 0) {
      console.log(`\n${c.dim(`${msg.undated} (${agenda.undated.length})`)}`);
      printTaskList(agenda.undated, msg);
    }
    return;
  }

  if (cmd === 'kanban' || cmd === 'board' || cmd === 'pano') {
    const positional = stripOptions(rest);
    const groupBy = positional[0] === 'status' || positional[0] === 'durum' ? 'status' : 'priority';
    const board = await store.getKanbanBoard(groupBy);
    if (asJson) {
      console.log(JSON.stringify(board, null, 2));
      return;
    }
    for (const [col, items] of Object.entries(board.columns)) {
      console.log(`\n${c.bold(col.toUpperCase())} ${c.dim(`(${items.length})`)}`);
      printTaskList(items, msg);
    }
    return;
  }

  if (cmd === 'serve' || cmd === 'server' || cmd === 'daemon' || cmd === 'sunucu') {
    const positional = stripOptions(rest, ['--port', '-p']);
    const action = (positional[0] || 'status').toLowerCase();
    const portVal = getOptionValue(rest, ['--port', '-p']);
    const port = portVal ? Number.parseInt(portVal, 10) : undefined;
    const foreground = hasAnyFlag(rest, ['--fg', '--foreground']);

    if (action === 'start' || action === 'baslat' || action === 'başlat' || foreground) {
      const res = await store.startHeadlessServer({ port, foreground });
      if (asJson) console.log(JSON.stringify(res, null, 2));
      else if (res.url) {
        console.log(`${c.green(msg.serverStarted)}: ${c.bold(res.url)} ${c.dim(`(PID ${res.pid ?? '?'})`)}`);
        console.log(`${c.dim('Incoming Webhook')}: ${res.incomingWebhookUrl}`);
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
      console.log(`${c.green('ON')} ${c.bold(status.url)} ${c.dim(status.headless ? '(headless)' : '(desktop)')}`);
      console.log(`${c.dim('Incoming Webhook')}: ${status.incomingWebhookUrl}`);
    } else {
      console.log(c.dim(msg.serverNotRunning));
    }
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
      console.log(`${c.green(msg.updateAvailable)}: v${res.currentVersion} -> v${res.latestVersion} (${res.releaseUrl})`);
    } else {
      console.log(`${c.green(msg.upToDate)}: v${res.currentVersion}`);
    }
    return;
  }

  if (cmd === 'bak' || cmd === 'show' || cmd === 'info' || cmd === 'detay') {
    const selector = rest.filter((a) => !a.startsWith('-')).join(' ').trim();
    if (!selector) {
      console.error(msg.selectorRequired);
      process.exit(1);
    }
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
    if (task.notes) {
      console.log(`\n${c.dim(`${msg.notes}:`)}\n${task.notes}`);
    }
    if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
      console.log(`\n${c.dim(`${msg.subtasks}:`)}`);
      task.subtasks.forEach((s, idx) => {
        console.log(`  ${c.dim(`${idx + 1}.`)} ${s.completed ? c.green('[x]') : '[ ]'} ${s.title}`);
      });
    }
    return;
  }

  if (cmd === 'sub' || cmd === 'subtask' || cmd === 'alt') {
    const taskSel = rest[0];
    if (!taskSel) {
      console.error(msg.selectorRequired);
      process.exit(1);
    }
    const action = (rest[1] || 'list').toLowerCase();
    if (action === 'list' || action === '-j' || action === '--json') {
      const task = await store.getTask(taskSel);
      if (asJson) {
        console.log(JSON.stringify(task.subtasks || [], null, 2));
        return;
      }
      if (!task.subtasks || task.subtasks.length === 0) {
        console.log(c.dim(msg.noTasks));
        return;
      }
      task.subtasks.forEach((s, idx) => {
        console.log(`${c.dim(`${idx + 1}.`)} ${s.completed ? c.green('[x]') : '[ ]'} ${s.title}`);
      });
      return;
    }
    if (action === '+' || action === 'add' || action === 'ekle') {
      const subTitle = rest.slice(2).filter((a) => a !== '-j' && a !== '--json').join(' ').trim();
      const created = await store.addSubtask(taskSel, subTitle);
      if (asJson) console.log(JSON.stringify(created, null, 2));
      else console.log(`${c.green(msg.subAdded)}: ${c.bold(created.title)}`);
      return;
    }
    if (action === 'ok' || action === 'done' || action === 'toggle') {
      const subSel = stripOptions(rest.slice(2)).join(' ').trim();
      const updated = await store.toggleSubtask(taskSel, subSel);
      if (asJson) console.log(JSON.stringify(updated, null, 2));
      else console.log(`${c.green(msg.subUpdated)}: ${updated.completed ? '[x]' : '[ ]'} ${c.bold(updated.title)}`);
      return;
    }
    if (action === 'edit' || action === 'duzenle' || action === 'rename') {
      const subSel = rest[2];
      const newTitle = stripOptions(rest.slice(3)).join(' ').trim();
      const updated = await store.updateSubtask(taskSel, subSel, { title: newTitle });
      if (asJson) console.log(JSON.stringify(updated, null, 2));
      else console.log(`${c.green(msg.subUpdated)}: ${c.bold(updated.title)}`);
      return;
    }
    if (action === 'rm' || action === 'del' || action === 'sil') {
      const subSel = stripOptions(rest.slice(2)).join(' ').trim();
      const removed = await store.deleteSubtask(taskSel, subSel);
      if (asJson) console.log(JSON.stringify(removed, null, 2));
      else console.log(`${c.yellow(msg.subDeleted)}: ${c.bold(removed.title)}`);
      return;
    }
    console.error(`${msg.unknownCmd}: "sub ${action}". ${msg.helpHint}`);
    process.exit(1);
  }

  if (cmd === 'cat' || cmd === 'cats' || cmd === 'categories' || cmd === 'kategoriler') {
    const subCmd = (rest[0] || '').toLowerCase();
    if (!subCmd || subCmd.startsWith('-')) {
      const categories = await store.listCategories();
      if (asJson) {
        console.log(JSON.stringify(categories, null, 2));
        return;
      }
      if (categories.length === 0) {
        console.log(c.dim(msg.noCategories));
        return;
      }
      categories.forEach((cat, idx) => {
        const pin = cat.pinned ? c.magenta('^ ') : '';
        console.log(
          `${c.dim(`${idx + 1}.`)} ${pin}${c.bold(cat.name)} ${c.dim(`(${cat.color} · ${cat.activeTaskCount})`)}`,
        );
      });
      return;
    }
    if (subCmd === '+' || subCmd === 'add' || subCmd === 'ekle') {
      const tokens = rest.slice(1);
      const optColor = getOptionValue(tokens, ['--color']);
      const positional = stripOptions(tokens, ['--color']);
      const colorTok = optColor || positional.find((t) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t));
      const pinned = hasAnyFlag(tokens, ['--pin', '^']);
      const name = positional.filter((t) => t !== colorTok && t !== '^').join(' ').trim();
      const created = await store.createCategory({ name, color: colorTok, pinned });
      if (asJson) console.log(JSON.stringify(created, null, 2));
      else console.log(`${c.green(msg.catAdded)}: ${c.bold(created.name)} ${c.dim(`(${created.color})`)}`);
      return;
    }
    if (subCmd === 'edit' || subCmd === 'duzenle' || subCmd === 'set') {
      const sel = rest[1];
      const opts = rest.slice(2);
      const patch = {};
      const newName = getOptionValue(opts, ['--name']);
      const newColor = getOptionValue(opts, ['--color']) || opts.find((t) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t));
      if (newName) patch.name = newName;
      if (newColor) patch.color = newColor;
      if (hasAnyFlag(opts, ['--pin'])) patch.pinned = true;
      if (hasAnyFlag(opts, ['--unpin'])) patch.pinned = false;
      const updated = await store.updateCategory(sel, patch);
      if (asJson) console.log(JSON.stringify(updated, null, 2));
      else console.log(`${c.green(msg.catUpdated)}: ${c.bold(updated.name)} ${c.dim(`(${updated.color})`)}`);
      return;
    }
    if (subCmd === 'move' || subCmd === 'tasi' || subCmd === 'taşı') {
      const positional = stripOptions(rest.slice(1));
      const sel = positional[0];
      const pos = positional[1];
      const moved = await store.moveCategory(sel, pos);
      if (asJson) console.log(JSON.stringify(moved, null, 2));
      else console.log(`${c.green(msg.moved)}: ${c.bold(moved.name)} -> #${moved.position}`);
      return;
    }
    if (subCmd === 'rm' || subCmd === 'del' || subCmd === 'sil') {
      const sel = stripOptions(rest.slice(1)).join(' ').trim();
      const removed = await store.deleteCategory(sel);
      if (asJson) console.log(JSON.stringify(removed, null, 2));
      else console.log(`${c.yellow(msg.catTrashed)}: ${c.bold(removed.name)}`);
      return;
    }
    console.error(`${msg.unknownCmd}: "cat ${subCmd}". ${msg.helpHint}`);
    process.exit(1);
  }

  if (cmd === 'cop' || cmd === 'çöp' || cmd === 'trash') {
    const subCmd = (rest[0] || '').toLowerCase();
    if (subCmd === 'bosalt' || subCmd === 'boşalt' || subCmd === 'empty') {
      if (!hasAnyFlag(rest, ['--yes', '-y'])) {
        console.error(msg.confirmYesRequired);
        process.exit(1);
      }
      const res = await store.emptyTrash();
      if (asJson) console.log(JSON.stringify(res, null, 2));
      else console.log(c.yellow(`${msg.trashEmptied} (${res.deletedTodos} / ${res.deletedCategories})`));
      return;
    }
    if (subCmd === 'sil' || subCmd === 'rm' || subCmd === 'delete') {
      const sel = stripOptions(rest.slice(1)).join(' ').trim();
      const res = await store.permanentDeleteItem(sel);
      if (asJson) console.log(JSON.stringify(res, null, 2));
      else console.log(`${c.red(msg.permDeleted)}: ${c.bold(res.label)}`);
      return;
    }
    const query = getOptionValue(rest, ['-q', '--query']);
    const dateFrom = getOptionValue(rest, ['--from']);
    const dateTo = getOptionValue(rest, ['--to']);
    const typeFilter = getOptionValue(rest, ['--type']) || 'all';
    const sortBy = getOptionValue(rest, ['--sort']) || 'newest';
    const data = await store.listTrash({
      typeFilter,
      sortBy,
      query: query || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
    if (asJson) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    if (data.categories.length === 0 && data.todos.length === 0) {
      console.log(c.dim(msg.trashEmpty));
      return;
    }
    if (data.categories.length > 0) {
      console.log(c.dim(`${msg.categories}:`));
      data.categories.forEach((cat, i) => console.log(`  ${c.dim(`${i + 1}.`)} ${cat.name}`));
    }
    if (data.todos.length > 0) {
      console.log(c.dim(`${msg.tasks}:`));
      printTaskList(data.todos, msg);
    }
    return;
  }

  if (cmd === 'geri' || cmd === 'undo' || cmd === 'restore') {
    const selector = stripOptions(rest).join(' ').trim();
    const res = await store.restoreItem(selector || undefined, 'auto');
    if (asJson) {
      console.log(JSON.stringify(res.item, null, 2));
    } else {
      console.log(`${c.bold(res.item.title || res.item.name)} ${c.green(msg.restored)}`);
    }
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
    const outFile = stripOptions(rest)[0];
    const res = await store.exportBackup(outFile);
    if (asJson || !outFile) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`${c.green(msg.exported)}: ${res.filePath} (${res.todos} ${msg.tasks.toLowerCase()})`);
    }
    return;
  }

  if (cmd === 'import' || cmd === 'yukle' || cmd === 'yükle') {
    const inFile = stripOptions(rest)[0];
    if (!inFile) {
      console.error('Backup file path is required. Example: ag import backup.json (or ag import -)');
      process.exit(1);
    }
    let payloadOrPath = inFile;
    if (inFile === '-') {
      const rawStdin = await readStdinUtf8();
      payloadOrPath = JSON.parse(rawStdin);
    }
    const restored = await store.importBackup(payloadOrPath);
    if (asJson) console.log(JSON.stringify(restored, null, 2));
    else console.log(`${c.green(msg.imported)}: ${restored.todos.length} ${msg.tasks.toLowerCase()}, ${restored.categories.length} ${msg.categories.toLowerCase()}`);
    return;
  }

  if (cmd === 'sync' || cmd === 'esitle' || cmd === 'eşitle') {
    const positional = stripOptions(rest);
    const sub = (positional[0] || '').toLowerCase();
    if (sub === 'status' || sub === 'durum') {
      const st = await store.getCloudStatus();
      console.log(JSON.stringify(st, null, 2));
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
      else console.log(`${c.green(msg.cloudPulled)}: ${res.bootstrap?.todos?.length ?? 0} ${msg.tasks.toLowerCase()}`);
      return;
    }
    const res = await store.syncCloud();
    if (asJson) console.log(JSON.stringify(res, null, 2));
    else console.log(`${c.green(msg.synced)}: ${res?.folderPath || ''}`);
    return;
  }

  if (cmd === 'reset' || cmd === 'sifirla' || cmd === 'sıfırla') {
    if (!hasAnyFlag(rest, ['--yes', '-y'])) {
      console.error(msg.confirmYesRequired);
      process.exit(1);
    }
    const resetSettings = hasAnyFlag(rest, ['--all', '--settings']);
    const fresh = await store.resetAllData({ resetSettings });
    if (asJson) console.log(JSON.stringify(fresh, null, 2));
    else console.log(c.yellow(msg.resetDone));
    return;
  }

  if (cmd === 'config' || cmd === 'ayar' || cmd === 'settings') {
    const positional = stripOptions(rest);
    if (positional.length === 0) {
      const settings = await store.getSettings();
      console.log(JSON.stringify(settings, null, 2));
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
    return;
  }

  if (cmd === 'hook' || cmd === 'webhook') {
    const positional = stripOptions(rest, ['--limit']);
    const sub = (positional[0] || '').toLowerCase();
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
      else console.log(`${c.green(msg.configSaved)}: webhookEvents = ${updated.webhookEvents || '*'}`);
      return;
    }
    if (sub === 'set') {
      const url = positional[1] || '';
      const secret = positional[2];
      const patch = { webhookUrl: url, webhookEnabled: Boolean(url) };
      if (secret !== undefined) patch.webhookSecret = secret;
      const updated = await store.updateSettings(patch);
      if (asJson) console.log(JSON.stringify(updated, null, 2));
      else console.log(`${c.green(msg.configSaved)}: webhookUrl = ${updated.webhookUrl || '(empty)'}`);
      return;
    }
    if (sub === 'on' || sub === 'off') {
      const updated = await store.updateSettings({ webhookEnabled: sub === 'on' });
      if (asJson) console.log(JSON.stringify(updated, null, 2));
      else console.log(`${c.green(msg.configSaved)}: webhookEnabled = ${updated.webhookEnabled ? 'true' : 'false'}`);
      return;
    }
    const urlArg = positional.find((a) => a !== 'test');
    const result = await store.testWebhook(urlArg || undefined);
    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.ok) {
      console.log(c.green(`${msg.webhookOk} (HTTP ${result.statusCode ?? 200}, ${result.latencyMs ?? 0}ms)`));
    } else {
      console.error(c.red(`${msg.webhookFail}: ${result.error || 'Error'}`));
      process.exit(1);
    }
    return;
  }

  if (cmd === 'ara' || cmd === 'find' || cmd === 'search' || cmd === '/') {
    const query = stripOptions(rest, ['--from', '--to', '--sort', '--cat', '--category', '--priority', '--tag']).join(' ').trim();
    if (!query) {
      console.error(msg.searchRequired);
      process.exit(1);
    }
    const filter = hasAnyFlag(rest, ['-a', '--all']) ? 'all' : 'active';
    const dateFrom = getOptionValue(rest, ['--from']);
    const dateTo = getOptionValue(rest, ['--to']);
    const sortBy = getOptionValue(rest, ['--sort']) || 'manual';
    const category = getOptionValue(rest, ['--cat', '--category']) || undefined;
    const priority = getOptionValue(rest, ['--priority']) || undefined;
    const [list, cats] = await Promise.all([
      store.listTasks({ filter, query, dateFrom, dateTo, sortBy, category, priority }),
      store.listCategories(),
    ]);
    if (asJson) {
      console.log(JSON.stringify(list, null, 2));
      return;
    }
    printTaskList(list, msg, new Map(cats.map((x) => [x.id, x.name])));
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
      cmd === 'today' || cmd === 'bugun' || cmd === 'bugün' || hasAnyFlag(rest, ['-t', '--today']);
    const isImportant =
      cmd === 'imp' || cmd === 'onemli' || cmd === 'önemli' || hasAnyFlag(rest, ['-i', '--important']);
    const isDone = cmd === 'tamam' || hasAnyFlag(rest, ['-c', '--done']);
    const isAll = hasAnyFlag(rest, ['-a', '--all']);
    const isPinned = hasAnyFlag(rest, ['--pinned']);
    const dateFrom = getOptionValue(rest, ['--from']);
    const dateTo = getOptionValue(rest, ['--to']);
    const query = getOptionValue(rest, ['-q', '--query']);
    const sortBy = getOptionValue(rest, ['--sort']) || 'manual';
    const priority = getOptionValue(rest, ['--priority', '-p']) || undefined;
    const tag = getOptionValue(rest, ['--tag']) || undefined;
    const slashCat = rest.find((t) => t.startsWith('/') && t.length > 1);
    const category = getOptionValue(rest, ['--cat', '--category']) || (slashCat ? slashCat.slice(1) : undefined);

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
      store.listTasks({ filter, query, dateFrom, dateTo, category, sortBy, priority, tag }),
      store.listCategories(),
    ]);
    const list = isToday && isImportant ? rawList.filter((t) => t.important) : rawList;
    if (asJson) {
      console.log(JSON.stringify(list, null, 2));
      return;
    }
    printTaskList(list, msg, new Map(cats.map((x) => [x.id, x.name])));
    return;
  }

  if (cmd === 'move' || cmd === 'tasi' || cmd === 'taşı') {
    const positional = stripOptions(rest);
    if (positional.length < 2) {
      console.error(msg.selectorRequired);
      process.exit(1);
    }
    const pos = positional[positional.length - 1];
    const sel = positional.slice(0, -1).join(' ');
    const moved = await store.moveTask(sel, pos);
    if (asJson) console.log(JSON.stringify(moved, null, 2));
    else console.log(`${c.green(msg.moved)}: ${c.bold(moved.title)} -> #${moved.position}`);
    return;
  }

  if (cmd === 'add' || cmd === '+' || cmd === 'a' || cmd === 'ekle') {
    const positionalOnly = rest.filter((t) => t !== '-j' && t !== '--json');
    if (positionalOnly[0] === '-' || (positionalOnly.length === 0 && !process.stdin.isTTY)) {
      const raw = await readStdinUtf8();
      const lines = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) {
        console.error(msg.titleRequired);
        process.exit(1);
      }
      const createdList = [];
      for (const line of lines) {
        const parsedLine = parseNaturalTaskTokens(line.split(/\s+/), false);
        if (parsedLine.title) {
          createdList.push(await store.addTask(parsedLine));
        }
      }
      if (asJson) {
        console.log(JSON.stringify(createdList, null, 2));
      } else {
        createdList.forEach((item) => console.log(`${c.green(msg.added)}: ${c.bold(item.title)}`));
      }
      return;
    }
    const parsed = parseNaturalTaskTokens(rest, false);
    if (!parsed.title) {
      console.error(msg.titleRequired);
      process.exit(1);
    }
    const created = await store.addTask(parsed);
    if (asJson) {
      console.log(JSON.stringify(created, null, 2));
    } else {
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
    const selector = rest[0];
    if (!selector) {
      console.error(msg.selectorRequired);
      process.exit(1);
    }
    const parsed = parseNaturalTaskTokens(rest.slice(1), true);
    const patch = {};
    if (parsed.title) patch.title = parsed.title;
    if (parsed.notes !== undefined) patch.notes = parsed.notes;
    if (parsed.startDate !== undefined) patch.startDate = parsed.startDate;
    if (parsed.dueDate !== undefined) patch.dueDate = parsed.dueDate;
    if (parsed.dueTime !== undefined) patch.dueTime = parsed.dueTime;
    if (parsed.priority !== undefined) patch.priority = parsed.priority;
    if (parsed.important !== undefined) patch.important = parsed.important;
    if (parsed.pinned !== undefined) patch.pinned = parsed.pinned;
    if (parsed.tags !== undefined) patch.tags = parsed.tags;
    if (parsed.category !== undefined) patch.category = parsed.category;
    const updated = await store.updateTask(selector, patch);
    if (asJson) console.log(JSON.stringify(updated, null, 2));
    else console.log(`${c.green(msg.updated)}: ${c.bold(updated.title)}${formatDueBadge(updated, msg)}`);
    return;
  }

  if (cmd === 'ok' || cmd === 'done' || cmd === 'd' || cmd === 'complete' || cmd === 'bitir') {
    const selectors = parseBatchSelectors(stripOptions(rest));
    if (selectors.length === 0) {
      console.error(msg.selectorRequired);
      process.exit(1);
    }
    if (selectors.length > 1) {
      const results = await store.batchCompleteTasks(selectors);
      if (asJson) console.log(JSON.stringify(results, null, 2));
      else {
        results.forEach((u) => {
          const statusText = u.completed ? c.green(msg.completed) : c.yellow(msg.reopened);
          console.log(`${statusText}: ${c.bold(u.title)}`);
        });
      }
      return;
    }
    const updated = await store.completeTask(selectors[0]);
    if (asJson) {
      console.log(JSON.stringify(updated, null, 2));
    } else {
      const statusText = updated.completed ? c.green(msg.completed) : c.yellow(msg.reopened);
      console.log(`${statusText}: ${c.bold(updated.title)}`);
    }
    return;
  }

  if (cmd === 'pin' || cmd === 'sabitle') {
    const selectors = parseBatchSelectors(stripOptions(rest));
    if (selectors.length === 0) {
      console.error(msg.selectorRequired);
      process.exit(1);
    }
    if (selectors.length > 1) {
      const results = await store.batchPinTasks(selectors);
      if (asJson) console.log(JSON.stringify(results, null, 2));
      else {
        results.forEach((u) => {
          const statusText = u.pinned ? c.magenta(msg.pinned) : c.dim(msg.unpinned);
          console.log(`${statusText}: ${c.bold(u.title)}`);
        });
      }
      return;
    }
    const updated = await store.pinTask(selectors[0]);
    if (asJson) {
      console.log(JSON.stringify(updated, null, 2));
    } else {
      const statusText = updated.pinned ? c.magenta(msg.pinned) : c.dim(msg.unpinned);
      console.log(`${statusText}: ${c.bold(updated.title)}`);
    }
    return;
  }

  if (cmd === 'rm' || cmd === 'del' || cmd === 'sil' || cmd === 'delete') {
    const selectors = parseBatchSelectors(stripOptions(rest));
    if (selectors.length === 0) {
      console.error(msg.selectorRequired);
      process.exit(1);
    }
    if (selectors.length > 1) {
      const results = await store.batchDeleteTasks(selectors);
      if (asJson) console.log(JSON.stringify(results, null, 2));
      else results.forEach((r) => console.log(`${c.yellow(msg.trashed)}: ${c.bold(r.title)}`));
      return;
    }
    const removed = await store.deleteTask(selectors[0]);
    if (asJson) {
      console.log(JSON.stringify(removed, null, 2));
    } else {
      console.log(`${c.yellow(msg.trashed)}: ${c.bold(removed.title)}`);
    }
    return;
  }

  console.error(`${msg.unknownCmd}: "${cmd}". ${msg.helpHint}`);
  process.exit(1);
}

main().catch((err) => {
  if (err && err.code === 'SQLITE_ABI_MISMATCH') {
    process.exit(store.ABI_FALLBACK_EXIT_CODE);
  }
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
