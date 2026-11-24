import type { BootstrapPayload, Category, Priority, Todo } from '../types';
import { getLocalDateString, isValidIsoDateString, sanitizeDueTime } from './todoLogic';

function escapeCsvCell(raw: string): string {
  const str = String(raw ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvExport(todos: readonly Todo[], categories: readonly Category[]): string {
  const catNameById = new Map(categories.map((c) => [c.id, c.name]));
  const header = [
    'Title',
    'Completed',
    'Priority',
    'Important',
    'Pinned',
    'Category',
    'StartDate',
    'DueDate',
    'DueTime',
    'Tags',
    'Notes',
    'Subtasks',
    'CreatedAt',
  ];
  const rows = [header.join(',')];
  for (const t of todos) {
    const catName = t.categoryId ? (catNameById.get(t.categoryId) ?? '') : '';
    const tags = Array.isArray(t.tags) ? t.tags.join('; ') : '';
    const subtasks = Array.isArray(t.subtasks)
      ? t.subtasks.map((s) => `${s.completed ? '[x]' : '[ ]'} ${s.title}`).join(' | ')
      : '';
    rows.push(
      [
        escapeCsvCell(t.title),
        t.completed ? 'true' : 'false',
        t.priority,
        t.important ? 'true' : 'false',
        t.pinned ? 'true' : 'false',
        escapeCsvCell(catName),
        t.startDate ?? '',
        t.dueDate ?? '',
        t.dueTime ?? '',
        escapeCsvCell(tags),
        escapeCsvCell(t.notes ?? ''),
        escapeCsvCell(subtasks),
        t.createdAt ?? '',
      ].join(','),
    );
  }
  // Prefix UTF-8 BOM for clean Excel compatibility across all 73 scripts
  return `\uFEFF${rows.join('\r\n')}\r\n`;
}

export function buildMarkdownExport(
  todos: readonly Todo[],
  categories: readonly Category[],
): string {
  const catNameById = new Map(categories.map((c) => [c.id, c.name]));
  const lines: string[] = [`# Agendamea Tasks (${getLocalDateString()})`, ''];

  const grouped = new Map<string, Todo[]>();
  for (const t of todos) {
    const groupKey = t.categoryId ? (catNameById.get(t.categoryId) ?? 'Uncategorized') : 'Inbox';
    const arr = grouped.get(groupKey) ?? [];
    arr.push(t);
    grouped.set(groupKey, arr);
  }

  for (const [groupName, items] of grouped.entries()) {
    lines.push(`## ${groupName}`, '');
    for (const t of items) {
      const box = t.completed ? 'x' : ' ';
      const meta: string[] = [];
      if (t.priority === 'high') meta.push('!high');
      else if (t.priority === 'low') meta.push('!low');
      if (t.important) meta.push('*important');
      if (t.dueDate) meta.push(`@${t.dueDate}${t.dueTime ? ` ${t.dueTime}` : ''}`);
      if (t.tags?.length) meta.push(...t.tags.map((tg) => `#${tg}`));
      const suffix = meta.length > 0 ? ` (${meta.join(' ')})` : '';
      lines.push(`- [${box}] ${t.title}${suffix}`);
      if (t.notes?.trim()) {
        for (const noteLine of t.notes.trim().split(/\r?\n/)) {
          lines.push(`  > ${noteLine}`);
        }
      }
      for (const sub of t.subtasks ?? []) {
        lines.push(`  - [${sub.completed ? 'x' : ' '}] ${sub.title}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

function escapeIcsText(raw: string): string {
  return String(raw ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function formatIcsDateStamp(isoDate: string, dueTime?: string | null): string {
  const compact = isoDate.replace(/-/g, '');
  if (dueTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) {
    const [hh, mm] = dueTime.split(':');
    return `${compact}T${hh}${mm}00`;
  }
  return compact;
}

export function buildIcsExport(todos: readonly Todo[], categories: readonly Category[]): string {
  const catNameById = new Map(categories.map((c) => [c.id, c.name]));
  const dtstamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vellium//Agendamea//EN',
    'CALSCALE:GREGORIAN',
  ];

  for (const t of todos) {
    lines.push('BEGIN:VTODO');
    lines.push(`UID:${t.id}@agendamea.local`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`SUMMARY:${escapeIcsText(t.title)}`);
    if (t.notes?.trim()) {
      lines.push(`DESCRIPTION:${escapeIcsText(t.notes.trim())}`);
    }
    lines.push(`STATUS:${t.completed ? 'COMPLETED' : 'NEEDS-ACTION'}`);
    lines.push(`PRIORITY:${t.priority === 'high' ? 1 : t.priority === 'low' ? 9 : 5}`);
    if (t.dueDate && isValidIsoDateString(t.dueDate)) {
      if (t.dueTime) {
        lines.push(`DUE:${formatIcsDateStamp(t.dueDate, t.dueTime)}`);
      } else {
        lines.push(`DUE;VALUE=DATE:${formatIcsDateStamp(t.dueDate)}`);
      }
    }
    if (t.startDate && isValidIsoDateString(t.startDate)) {
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDateStamp(t.startDate)}`);
    }
    const cats: string[] = [];
    if (t.categoryId && catNameById.has(t.categoryId)) {
      cats.push(catNameById.get(t.categoryId) as string);
    }
    if (t.tags?.length) cats.push(...t.tags);
    if (cats.length > 0) {
      lines.push(`CATEGORIES:${cats.map(escapeIcsText).join(',')}`);
    }
    lines.push('END:VTODO');
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function normalizeImportedPriority(raw: string): Priority {
  const low = raw.trim().toLowerCase();
  if (low === 'high' || low === 'p1' || low === '1' || low === 'urgent' || low === 'yüksek') {
    return 'high';
  }
  if (low === 'low' || low === 'p4' || low === '4' || low === '9' || low === 'düşük') {
    return 'low';
  }
  return 'normal';
}

/**
 * Parses Agendamea CSV or Todoist CSV exports into a valid Partial<BootstrapPayload> backup shape.
 */
export function parseCsvToBackupPayload(csvText: string): Partial<BootstrapPayload> {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    throw new Error('CSV_EMPTY');
  }
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const idxOf = (...names: string[]) => header.findIndex((h) => names.includes(h));

  const titleIdx = idxOf('title', 'content', 'task', 'name', 'subject', 'başlık');
  if (titleIdx < 0) {
    throw new Error('CSV_MISSING_TITLE');
  }
  const notesIdx = idxOf('notes', 'description', 'notlar');
  const completedIdx = idxOf('completed', 'done', 'checked', 'status');
  const priorityIdx = idxOf('priority', 'öncelik');
  const importantIdx = idxOf('important', 'starred');
  const pinnedIdx = idxOf('pinned');
  const categoryIdx = idxOf('category', 'project', 'list', 'kategori');
  const startIdx = idxOf('startdate', 'start_date', 'start');
  const dueIdx = idxOf('duedate', 'due_date', 'date', 'due');
  const timeIdx = idxOf('duetime', 'due_time', 'time');
  const tagsIdx = idxOf('tags', 'labels');
  const typeIdx = idxOf('type'); // Todoist CSV has TYPE=task|section|note

  const nowIso = new Date().toISOString();
  const categoriesMap = new Map<string, Category>();
  const todos: Todo[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const cols = rows[i] ?? [];
    if (typeIdx >= 0) {
      const rowType = (cols[typeIdx] ?? '').trim().toLowerCase();
      if (rowType && rowType !== 'task') continue;
    }
    const rawTitle = (cols[titleIdx] ?? '').trim();
    if (!rawTitle) continue;

    let categoryId: string | null = null;
    if (categoryIdx >= 0) {
      const catName = (cols[categoryIdx] ?? '').trim();
      if (catName) {
        const key = catName.toLowerCase();
        let cat = categoriesMap.get(key);
        if (!cat) {
          cat = {
            id: `cat-csv-${categoriesMap.size + 1}-${Date.now().toString(36)}`,
            name: catName.slice(0, 60),
            color: '#2563eb',
            pinned: false,
            sortOrder: categoriesMap.size,
            createdAt: nowIso,
            deletedAt: null,
          };
          categoriesMap.set(key, cat);
        }
        categoryId = cat.id;
      }
    }

    const rawDue = dueIdx >= 0 ? (cols[dueIdx] ?? '').trim().slice(0, 10) : '';
    const rawStart = startIdx >= 0 ? (cols[startIdx] ?? '').trim().slice(0, 10) : '';
    const rawTime = timeIdx >= 0 ? (cols[timeIdx] ?? '').trim() : '';
    const rawCompleted = completedIdx >= 0 ? (cols[completedIdx] ?? '').trim().toLowerCase() : '';
    const rawTags = tagsIdx >= 0 ? (cols[tagsIdx] ?? '').trim() : '';
    const tags = rawTags
      ? rawTags
          .split(/[;,]/)
          .map((s) => s.trim().replace(/^#+/, ''))
          .filter(Boolean)
          .slice(0, 12)
      : [];

    todos.push({
      id: `todo-csv-${i}-${Date.now().toString(36)}`,
      title: rawTitle.slice(0, 240),
      notes: notesIdx >= 0 ? (cols[notesIdx] ?? '').trim().slice(0, 5000) : '',
      completed:
        rawCompleted === 'true' ||
        rawCompleted === '1' ||
        rawCompleted === 'completed' ||
        rawCompleted === 'yes',
      important: importantIdx >= 0 && (cols[importantIdx] ?? '').trim().toLowerCase() === 'true',
      pinned: pinnedIdx >= 0 && (cols[pinnedIdx] ?? '').trim().toLowerCase() === 'true',
      priority: priorityIdx >= 0 ? normalizeImportedPriority(cols[priorityIdx] ?? '') : 'normal',
      startDate: isValidIsoDateString(rawStart) ? rawStart : null,
      dueDate: isValidIsoDateString(rawDue) ? rawDue : null,
      dueTime: sanitizeDueTime(rawTime),
      tags,
      categoryId,
      sortOrder: todos.length,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      subtasks: [],
    });
  }

  return {
    categories: Array.from(categoriesMap.values()),
    todos,
    trashedCategories: [],
    trashedTodos: [],
  };
}

function unescapeIcsValue(val: string): string {
  return val
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseIcsDateAndTime(raw: string): { date: string | null; time: string | null } {
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return { date: null, time: null };
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const time = m[4] && m[5] ? `${m[4]}:${m[5]}` : null;
  return {
    date: isValidIsoDateString(date) ? date : null,
    time: time ? sanitizeDueTime(time) : null,
  };
}

/**
 * Parses iCalendar (.ics) VTODO and VEVENT blocks into an Agendamea backup payload.
 */
export function parseIcsToBackupPayload(icsText: string): Partial<BootstrapPayload> {
  // Unfold RFC 5545 folded lines
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const nowIso = new Date().toISOString();
  const todos: Todo[] = [];
  let inBlock = false;
  let current: Record<string, string> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === 'BEGIN:VTODO' || line === 'BEGIN:VEVENT') {
      inBlock = true;
      current = {};
      continue;
    }
    if (line === 'END:VTODO' || line === 'END:VEVENT') {
      if (inBlock && current.SUMMARY?.trim()) {
        const due = parseIcsDateAndTime(current.DUE || current.DTEND || current.DTSTART || '');
        const start = current.DTSTART
          ? parseIcsDateAndTime(current.DTSTART)
          : { date: null, time: null };
        const prioNum = Number(current.PRIORITY || 5);
        const priority: Priority =
          prioNum >= 1 && prioNum <= 4 ? 'high' : prioNum >= 6 ? 'low' : 'normal';
        const tags = current.CATEGORIES
          ? current.CATEGORIES.split(',')
              .map((s) => unescapeIcsValue(s).trim())
              .filter(Boolean)
              .slice(0, 12)
          : [];
        todos.push({
          id: `todo-ics-${todos.length + 1}-${Date.now().toString(36)}`,
          title: unescapeIcsValue(current.SUMMARY).trim().slice(0, 240),
          notes: current.DESCRIPTION
            ? unescapeIcsValue(current.DESCRIPTION).trim().slice(0, 5000)
            : '',
          completed: (current.STATUS || '').toUpperCase() === 'COMPLETED',
          important: priority === 'high',
          pinned: false,
          priority,
          startDate: start.date !== due.date ? start.date : null,
          dueDate: due.date,
          dueTime: due.time ?? start.time,
          tags,
          categoryId: null,
          sortOrder: todos.length,
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
          subtasks: [],
        });
      }
      inBlock = false;
      current = {};
      continue;
    }
    if (!inBlock) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) continue;
    const propName = line.slice(0, colonIdx).split(';')[0]?.toUpperCase() ?? '';
    const value = line.slice(colonIdx + 1);
    if (propName && !(propName in current)) {
      current[propName] = value;
    }
  }

  return {
    categories: [],
    todos,
    trashedCategories: [],
    trashedTodos: [],
  };
}

export interface EncryptedBackupEnvelope {
  format: 'agendamea-encrypted-v1';
  alg: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function deriveAesGcmKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  usage: 'encrypt' | 'decrypt',
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

export async function encryptBackupPayload(
  payload: unknown,
  passphrase: string,
): Promise<EncryptedBackupEnvelope> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('PASSPHRASE_TOO_SHORT');
  }
  const iterations = 150_000;
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesGcmKey(passphrase, salt, iterations, 'encrypt');
  const plainBytes = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuf = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plainBytes as BufferSource,
  );
  return {
    format: 'agendamea-encrypted-v1',
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
  };
}

export function isEncryptedBackupEnvelope(obj: unknown): obj is EncryptedBackupEnvelope {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const o = obj as Record<string, unknown>;
  return (
    o.format === 'agendamea-encrypted-v1' &&
    o.alg === 'AES-256-GCM' &&
    typeof o.salt === 'string' &&
    typeof o.iv === 'string' &&
    typeof o.ciphertext === 'string'
  );
}

export async function decryptBackupPayload(
  envelope: EncryptedBackupEnvelope,
  passphrase: string,
): Promise<Record<string, unknown>> {
  const iterations =
    typeof envelope.iterations === 'number' &&
    envelope.iterations >= 10_000 &&
    envelope.iterations <= 1_000_000
      ? envelope.iterations
      : 150_000;
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const cipherBytes = base64ToBytes(envelope.ciphertext);
  const key = await deriveAesGcmKey(passphrase, salt, iterations, 'decrypt');
  const plainBuf = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    cipherBytes as BufferSource,
  );
  const decoded = new TextDecoder().decode(plainBuf);
  const parsed = JSON.parse(decoded) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('INVALID_DECRYPTED_PAYLOAD');
  }
  return parsed;
}
