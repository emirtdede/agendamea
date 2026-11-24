'use strict';

/**
 * Shell-Safe Natural Task Token Parser for Windows PowerShell, CMD, and Bash/Zsh.
 * Supports:
 * - Tags: `+tag`, `t:tag`, `--tag tag` (plus quoted `#tag`)
 * - Priority: `p:high|yuksek|h`, `p:low|dusuk|l`, `p:normal|n`, `-H`, `-L` (plus quoted `!`)
 * - Important / Pin: `i:`, `-I` (plus quoted `*`), `pin:`, `--pin` (plus quoted `^`)
 * - Multi-word category: `c:Work`, `c:"Personal Tasks"`, `/"Personal Tasks"`, `/Work`, `--cat "..."`
 * - Natural & relative dates: `@bugun`/`@today`, `@yarin`/`@tomorrow`, `@haftaya`/`@nextweek`,
 *   `@pazartesi..@pazar`, `@mon..@sun`, `+3g`, `+3d`, `+2h`, `+2w`, `@YYYY-MM-DD`, `@YYYY-MM-DD..YYYY-MM-DD`
 * - Times: `14:30`, `14.30` (normalized to `14:30`)
 * - Raw title escape: `--` stops token parsing so anything after `--` stays verbatim in title
 */

const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/;
const DECIMAL_UNIT_WORDS = new Set([
  'tl',
  'try',
  'usd',
  'eur',
  'gbp',
  'lira',
  'dolar',
  'euro',
  'dollar',
  'dollars',
  'kg',
  'gr',
  'g',
  'km',
  'm',
  'cm',
  'mm',
  'mb',
  'gb',
  'tb',
  'kb',
  'lt',
  'ml',
  'adet',
  'x',
  '%',
  '₺',
  '$',
  '€',
  '£',
]);
const NATURAL_TIME_WORDS = {
  sabah: '09:00',
  morning: '09:00',
  ogle: '12:00',
  noon: '12:00',
  ogleden: '14:00',
  afternoon: '14:00',
  aksam: '18:00',
  evening: '18:00',
  gece: '21:00',
  night: '21:00',
};

const WEEKDAY_MAP = {
  pazar: 0,
  paz: 0,
  sun: 0,
  sunday: 0,
  pazartesi: 1,
  pzt: 1,
  mon: 1,
  monday: 1,
  sali: 2,
  sal: 2,
  tue: 2,
  tues: 2,
  tuesday: 2,
  carsamba: 3,
  car: 3,
  wed: 3,
  wednesday: 3,
  persembe: 4,
  per: 4,
  thu: 4,
  thur: 4,
  thursday: 4,
  cuma: 5,
  cum: 5,
  fri: 5,
  friday: 5,
  cumartesi: 6,
  cmt: 6,
  sat: 6,
  saturday: 6,
};

function formatLocalIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(baseDate, days) {
  const dt = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  dt.setDate(dt.getDate() + days);
  return formatLocalIso(dt);
}

function nextWeekdayIso(baseDate, targetDay) {
  const current = baseDate.getDay();
  let diff = (targetDay - current + 7) % 7;
  if (diff === 0) diff = 7; // Next occurrence of that weekday
  return addDays(baseDate, diff);
}

function foldAscii(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();
}

function addMonths(baseDate, months) {
  const dt = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const targetDay = dt.getDate();
  dt.setDate(1);
  dt.setMonth(dt.getMonth() + months);
  const lastDayOfMonth = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  dt.setDate(Math.min(targetDay, lastDayOfMonth));
  return formatLocalIso(dt);
}

function resolveDateToken(rawToken, baseDate = new Date()) {
  const folded = foldAscii(rawToken);
  if (!folded) return null;
  if (folded === 'bugun' || folded === 'today') return formatLocalIso(baseDate);
  if (folded === 'yarin' || folded === 'tomorrow') return addDays(baseDate, 1);
  if (folded === 'dun' || folded === 'yesterday') return addDays(baseDate, -1);
  if (folded === 'haftaya' || folded === 'nextweek' || folded === 'next-week')
    return addDays(baseDate, 7);
  if (folded === 'gelecekay' || folded === 'nextmonth' || folded === 'next-month')
    return addMonths(baseDate, 1);
  if (Object.hasOwn(WEEKDAY_MAP, folded)) {
    return nextWeekdayIso(baseDate, WEEKDAY_MAP[folded]);
  }
  if (ISO_DATE_RE.test(folded)) return folded;

  const monthMatch = /^\+(\d{1,2})(ay|mo|m)$/i.exec(folded);
  if (monthMatch) {
    const qty = Number.parseInt(monthMatch[1], 10);
    return addMonths(baseDate, qty);
  }

  const relMatch = /^\+(\d{1,3})([gdhw])$/.exec(folded);
  if (relMatch) {
    const qty = Number.parseInt(relMatch[1], 10);
    const unit = relMatch[2];
    const mult = unit === 'h' || unit === 'w' ? 7 : 1;
    return addDays(baseDate, qty * mult);
  }
  return null;
}

function normalizeTimeToken(raw) {
  const clean = String(raw || '').trim();
  const folded = foldAscii(clean.replace(/^@/, ''));
  if (Object.hasOwn(NATURAL_TIME_WORDS, folded)) {
    return NATURAL_TIME_WORDS[folded];
  }
  const m = TIME_RE.exec(clean);
  if (!m) return null;
  const hh = m[1].padStart(2, '0');
  const mm = m[2];
  return `${hh}:${mm}`;
}

/**
 * Quote-aware shell line tokenizer for stdin batch input (`ag + -`).
 * Preserves spaces inside double or single quotes (e.g. `c:"Kişisel İşler" --note "iki kelime"`).
 */
function splitShellLine(line) {
  const tokens = [];
  let current = '';
  let quote = null;
  let escaped = false;
  const src = String(line || '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (escaped) current += '\\';
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function stripOuterQuotes(value) {
  const s = String(value || '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

function parseQuickTaskTokens(tokens, options = {}) {
  const baseDate = options.baseDate instanceof Date ? options.baseDate : new Date();
  const titleParts = [];
  let startDate = null;
  let dueDate = null;
  let dueTime = null;
  let priority = 'normal';
  let important = false;
  let pinned = false;
  let category = null;
  let notes = '';
  const tags = [];
  const subtasks = [];
  let rawMode = false;

  const pushTag = (raw) => {
    const clean = stripOuterQuotes(raw)
      .replace(/^[#+]+/, '')
      .trim();
    if (clean && !tags.includes(clean)) tags.push(clean);
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = String(tokens[i] ?? '');
    if (!tok) continue;

    if (rawMode) {
      titleParts.push(tok);
      continue;
    }

    if (tok === '--') {
      rawMode = true;
      continue;
    }

    // Never parse URLs as category/tag/time tokens
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(tok)) {
      titleParts.push(tok);
      continue;
    }

    // Legacy & shell-safe single markers
    if (
      tok === '!' ||
      tok === 'p:high' ||
      tok === 'p:yuksek' ||
      tok === 'p:yüksek' ||
      tok === 'p:h' ||
      tok === '-H'
    ) {
      priority = 'high';
      continue;
    }
    if (
      tok === 'p:low' ||
      tok === 'p:dusuk' ||
      tok === 'p:düşük' ||
      tok === 'p:l' ||
      tok === '-L'
    ) {
      priority = 'low';
      continue;
    }
    if (tok === 'p:normal' || tok === 'p:n') {
      priority = 'normal';
      continue;
    }
    if (tok === '*' || tok === 'i:' || tok === 'imp:' || tok === '-I') {
      important = true;
      continue;
    }
    if (tok === '^' || tok === 'pin:' || tok === '--pin') {
      pinned = true;
      continue;
    }

    // Explicit flag syntax inside quick-add (supports both `--flag val` and `--flag=val`)
    if ((tok === '--note' || tok === '--notes' || tok === '-n') && tokens[i + 1] !== undefined) {
      notes = String(tokens[++i]);
      continue;
    }
    if (tok.startsWith('--note=')) {
      notes = stripOuterQuotes(tok.slice('--note='.length));
      continue;
    }
    if (tok.startsWith('--notes=')) {
      notes = stripOuterQuotes(tok.slice('--notes='.length));
      continue;
    }
    if ((tok === '--sub' || tok === '-s') && tokens[i + 1] !== undefined) {
      subtasks.push(String(tokens[++i]));
      continue;
    }
    if (tok.startsWith('--sub=')) {
      const sv = stripOuterQuotes(tok.slice('--sub='.length));
      if (sv) subtasks.push(sv);
      continue;
    }
    if ((tok === '--cat' || tok === '--category' || tok === '-c') && tokens[i + 1] !== undefined) {
      category = stripOuterQuotes(tokens[++i]);
      continue;
    }
    if (tok.startsWith('--cat=') || tok.startsWith('--category=')) {
      category = stripOuterQuotes(tok.slice(tok.indexOf('=') + 1));
      continue;
    }
    if ((tok === '--tag' || tok === '-t') && tokens[i + 1] !== undefined) {
      pushTag(tokens[++i]);
      continue;
    }
    if (tok.startsWith('--tag=')) {
      pushTag(tok.slice('--tag='.length));
      continue;
    }
    if (tok === '--start' && tokens[i + 1] !== undefined) {
      const resolved = resolveDateToken(tokens[++i], baseDate);
      if (resolved) startDate = resolved;
      continue;
    }
    if (tok.startsWith('--start=')) {
      const resolved = resolveDateToken(tok.slice('--start='.length), baseDate);
      if (resolved) startDate = resolved;
      continue;
    }
    if (tok === '--due' && tokens[i + 1] !== undefined) {
      const resolved = resolveDateToken(tokens[++i], baseDate);
      if (resolved) dueDate = resolved;
      continue;
    }
    if (tok.startsWith('--due=')) {
      const resolved = resolveDateToken(tok.slice('--due='.length), baseDate);
      if (resolved) dueDate = resolved;
      continue;
    }
    if (tok === '--time' && tokens[i + 1] !== undefined) {
      const norm = normalizeTimeToken(tokens[++i]);
      if (norm) dueTime = norm;
      continue;
    }
    if (tok.startsWith('--time=')) {
      const norm = normalizeTimeToken(tok.slice('--time='.length));
      if (norm) dueTime = norm;
      continue;
    }
    if (tok === '--priority' && tokens[i + 1] !== undefined) {
      const pv = foldAscii(tokens[++i]);
      if (pv === 'high' || pv === 'yuksek' || pv === 'h') priority = 'high';
      else if (pv === 'low' || pv === 'dusuk' || pv === 'l') priority = 'low';
      else if (pv === 'normal' || pv === 'n') priority = 'normal';
      continue;
    }
    if (tok.startsWith('--priority=')) {
      const pv = foldAscii(tok.slice('--priority='.length));
      if (pv === 'high' || pv === 'yuksek' || pv === 'h') priority = 'high';
      else if (pv === 'low' || pv === 'dusuk' || pv === 'l') priority = 'low';
      else if (pv === 'normal' || pv === 'n') priority = 'normal';
      continue;
    }
    if (tok === '--important') {
      important = true;
      continue;
    }

    // Relative date offset token: +3g, +3d, +2h, +2w, +1ay, +1m, +2mo (checked BEFORE +tag!)
    if (/^\+\d{1,3}([gdhw]|ay|mo|m)$/i.test(tok)) {
      const resolved = resolveDateToken(tok, baseDate);
      if (resolved) {
        dueDate = resolved;
        continue;
      }
    }

    // Shell-safe tags: `+tag` MUST contain at least one letter so `+100` / `+905551234567` stay in title!
    if (/^\+(?=[\p{L}\p{N}_-]*\p{L})[\p{L}\p{N}_-]{1,28}$/u.test(tok)) {
      pushTag(tok.slice(1));
      continue;
    }
    if (/^t:[\p{L}\p{N}_-]{1,28}$/iu.test(tok)) {
      pushTag(tok.slice(2));
      continue;
    }
    if (tok.startsWith('#') && tok.length > 1) {
      pushTag(tok.slice(1));
      continue;
    }

    // Shell-safe category: `c:Work` or `c:"Kişisel İşler"` or single-segment `/Work` (never multi-segment paths `/api/v2`, `/etc/hosts`)
    if (/^c:.+/i.test(tok)) {
      category = stripOuterQuotes(tok.slice(2));
      continue;
    }
    if (
      tok.startsWith('/') &&
      tok.length > 1 &&
      !tok.includes('://') &&
      !tok.slice(1).includes('/')
    ) {
      category = stripOuterQuotes(tok.slice(1));
      continue;
    }

    // Dates or natural times: `@bugun`, `@yarin`, `@pazartesi`, `@haftaya`, `@sabah`, `@YYYY-MM-DD`, `@YYYY-MM-DD..YYYY-MM-DD`
    if (tok.startsWith('@') && tok.length > 1) {
      const body = tok.slice(1);
      if (body.includes('..')) {
        const [rawStart, rawEnd] = body.split('..');
        const rs = resolveDateToken(rawStart, baseDate);
        const re = resolveDateToken(rawEnd, baseDate);
        if (rs && re) {
          startDate = rs;
          dueDate = re;
          continue;
        }
      }
      const single = resolveDateToken(body, baseDate);
      if (single) {
        dueDate = single;
        continue;
      }
      const natTime = normalizeTimeToken(body);
      if (natTime) {
        dueTime = natTime;
        continue;
      }
    }

    // Bare ISO date (`2026-05-01`)
    if (ISO_DATE_RE.test(tok)) {
      dueDate = tok;
      continue;
    }

    // Time: `14:30` or `14.30` (protect decimal prices/quantities like `10.30 TL` or `2.50 kg`)
    if (TIME_RE.test(tok)) {
      const usesDot = tok.includes('.');
      const nextTok = tokens[i + 1]
        ? foldAscii(String(tokens[i + 1]).replace(/[.,;:!?]+$/, ''))
        : '';
      const isPriceOrQuantity = usesDot && nextTok && DECIMAL_UNIT_WORDS.has(nextTok);
      if (!isPriceOrQuantity) {
        dueTime = normalizeTimeToken(tok);
        continue;
      }
    }

    titleParts.push(tok);
  }

  return {
    title: titleParts.join(' ').trim(),
    startDate,
    dueDate,
    dueTime,
    priority,
    important,
    pinned,
    category,
    notes,
    tags,
    subtasks,
  };
}

module.exports = {
  resolveDateToken,
  normalizeTimeToken,
  splitShellLine,
  parseQuickTaskTokens,
};
