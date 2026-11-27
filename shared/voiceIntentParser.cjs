'use strict';

/**
 * WBS-4.1: Deterministic Fast-Path Natural Language Intent Parser (< 50 ms)
 * Supports Turkish + English natural commands AND universal 73-language ISO/symbol syntax
 * (YYYY-MM-DD, HH:mm, #tag, ! high priority, * important, ^ pinned, /Category).
 * Flags ALL destructive intents with destructive: true & requiresConfirmation: true.
 */

const { performance } = require('node:perf_hooks');

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(baseDate, offset) {
  const dt = new Date(baseDate.getTime());
  dt.setDate(dt.getDate() + offset);
  return formatLocalDate(dt);
}

function normalizeTr(text) {
  return String(text || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/['’`]/g, "'")
    .trim();
}

function stripDiacritics(text) {
  return String(text || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

function cleanTitle(raw) {
  return String(raw || '')
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractUniversalTaskFields(rawText, nowDate = new Date()) {
  let working = String(rawText || '').trim();
  let dueDate = null;
  let dueTime = null;
  let priority = null;
  let important = false;
  let pinned = false;
  let category = null;
  const tags = [];

  // 1. Tags (#tag)
  working = working.replace(/(?:^|\s)#([\p{L}\p{N}_-]{1,28})/gu, (_m, tag) => {
    tags.push(tag);
    return ' ';
  });

  // 2. Category (/Category)
  working = working.replace(/(?:^|\s)\/([\p{L}\p{N}_-]{1,40})/gu, (_m, cat) => {
    if (!category) category = cat;
    return ' ';
  });

  // 3. Explicit ISO date (YYYY-MM-DD, optional @ prefix)
  working = working.replace(/(?:^|\s)@?(\d{4}-\d{2}-\d{2})(?=\b|\s|$)/g, (_m, iso) => {
    if (!dueDate) dueDate = iso;
    return ' ';
  });

  // 4. Relative date words (Turkish + English + common European - Unicode-safe word boundaries)
  const trToday =
    /(?<![\p{L}\p{N}_])(bug[üu]n(?:[üu]n|e|k[üu]|[üu])?|today|heute|aujourd'hui|hoy|oggi)(?![\p{L}\p{N}_])/iu;
  const trTomorrow =
    /(?<![\p{L}\p{N}_])(yar[ıi]n(?:a|ki)?|tomorrow|morgen|demain|ma[ñn]ana|domani)(?![\p{L}\p{N}_])/iu;
  const trAfterTomorrow =
    /(?<![\p{L}\p{N}_])([öo]b[üu]r\s+g[üu]n|day\s+after\s+tomorrow)(?![\p{L}\p{N}_])/iu;

  if (!dueDate && trAfterTomorrow.test(working)) {
    dueDate = addDays(nowDate, 2);
    working = working.replace(trAfterTomorrow, ' ');
  } else if (!dueDate && trTomorrow.test(working)) {
    dueDate = addDays(nowDate, 1);
    working = working.replace(trTomorrow, ' ');
  } else if (!dueDate && trToday.test(working)) {
    dueDate = formatLocalDate(nowDate);
    working = working.replace(trToday, ' ');
  }

  // 5. Time (Turkish "saat 15:00'te", "15:00'te", "saat 15'te", English "at 15:30", or bare "10:30")
  working = working.replace(
    /(?:^|\s)(?:saat\s+|at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?:'?(?:te|ta|de|da|e|a))?(?=\b|\s|$)/giu,
    (_m, hh, mm) => {
      if (!dueTime) {
        dueTime = `${String(hh).padStart(2, '0')}:${mm}`;
      }
      return ' ';
    },
  );
  if (!dueTime) {
    working = working.replace(
      /(?:^|\s)(?:saat\s+|at\s+)([01]?\d|2[0-3])(?:'?(?:te|ta|de|da|e|a))?(?=\b|\s|$)/giu,
      (_m, hh) => {
        if (!dueTime) {
          dueTime = `${String(hh).padStart(2, '0')}:00`;
        }
        return ' ';
      },
    );
  }

  // 6. Priority & flags (!, *, ^, Turkish/English words)
  if (/(?:^|\s)!(?=\s|$)/.test(working)) {
    priority = 'high';
    working = working.replace(/(?:^|\s)!(?=\s|$)/g, ' ');
  }
  if (/(?:^|\s)\*(?=\s|$)/.test(working)) {
    important = true;
    working = working.replace(/(?:^|\s)\*(?=\s|$)/g, ' ');
  }
  if (/(?:^|\s)\^(?=\s|$)/.test(working)) {
    pinned = true;
    working = working.replace(/(?:^|\s)\^(?=\s|$)/g, ' ');
  }

  const highPriRe =
    /(?<![\p{L}\p{N}_])(y[üu]ksek\s+[öo]ncelik(?:li)?|acil|high\s+priority|urgent)(?![\p{L}\p{N}_])/giu;
  if (highPriRe.test(working)) {
    priority = 'high';
    working = working.replace(highPriRe, ' ');
  }
  const lowPriRe =
    /(?<![\p{L}\p{N}_])(d[üu][şs][üu]k\s+[öo]ncelik(?:li)?|low\s+priority)(?![\p{L}\p{N}_])/giu;
  if (!priority && lowPriRe.test(working)) {
    priority = 'low';
    working = working.replace(lowPriRe, ' ');
  }
  const impRe = /(?<![\p{L}\p{N}_])([öo]nemli|important)(?![\p{L}\p{N}_])/giu;
  if (impRe.test(working)) {
    important = true;
    working = working.replace(impRe, ' ');
  }

  return {
    cleaned: cleanTitle(working),
    dueDate,
    dueTime,
    priority: priority || 'normal',
    important,
    pinned,
    category,
    tags,
  };
}

function parseVoiceIntent(rawText, options = {}) {
  const startedAt = performance.now();
  const nowDate = options.now instanceof Date ? options.now : new Date();
  const text = String(rawText || '').trim();
  const norm = normalizeTr(text);
  const ascii = stripDiacritics(text);

  const finish = (result) => ({
    ...result,
    rawText: text,
    parser: 'fast-path',
    elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
  });

  if (!text) {
    return finish({
      intent: 'unknown',
      confidence: 0,
      destructive: false,
      requiresConfirmation: false,
      payload: {},
    });
  }

  // 1. DESTRUCTIVE GUARDS FIRST (always requiresConfirmation: true, NEVER auto-executed!)
  if (
    /\b(tum\s+(verileri|gorevlerimi|gorevleri|notlarimi)\s+(sil|sifirla|temizle)|her\s*seyi\s+(sil|sifirla)|delete\s+all(\s+my)?\s+(tasks|notes|data)|reset\s+all(\s+data)?|wipe\s+everything)\b/i.test(
      ascii,
    )
  ) {
    const isReset = /\b(sifirla|reset|wipe|verileri)\b/i.test(ascii);
    return finish({
      intent: isReset ? 'reset_all' : 'delete_task',
      confidence: 0.96,
      destructive: true,
      requiresConfirmation: true,
      payload: { scope: 'all' },
    });
  }

  if (/\b(cop\s*kutusunu\s*(bosalt|temizle)|empty\s+trash)\b/i.test(ascii)) {
    return finish({
      intent: 'empty_trash',
      confidence: 0.96,
      destructive: true,
      requiresConfirmation: true,
      payload: {},
    });
  }

  if (/\b(tamamlanan(?:lari|ları)?\s*(temizle|sil)|clear\s+completed)\b/i.test(ascii)) {
    return finish({
      intent: 'clear_completed',
      confidence: 0.94,
      destructive: true,
      requiresConfirmation: true,
      payload: {},
    });
  }

  // Single-task delete (still destructive -> requiresConfirmation: true)
  const trDelMatch = text.match(
    /^(.+?)\s+(?:g[öo]revini|notunu|g[öo]revi|notu)?\s*(?:sil|kald[ıi]r|ç[öo]pe\s+at)$/iu,
  );
  const enDelMatch = text.match(
    /^(?:delete|remove)\s+(?:task|note|my\s+task|my\s+note)?\s*(.+)$/iu,
  );
  if (trDelMatch || enDelMatch) {
    const target = cleanTitle((trDelMatch ? trDelMatch[1] : enDelMatch[1]) || '');
    if (target) {
      return finish({
        intent: 'delete_task',
        confidence: 0.9,
        destructive: true,
        requiresConfirmation: true,
        payload: { selector: target },
      });
    }
  }

  // 2. UNDO / RESTORE FROM TRASH
  if (
    /\b(geri\s+al|geri\s+yukle|son\s+silineni\s+geri|undo(\s+last)?(\s+delete)?|restore\s+last)\b/i.test(
      ascii,
    )
  ) {
    return finish({
      intent: 'undo_trash',
      confidence: 0.93,
      destructive: false,
      requiresConfirmation: false,
      payload: {},
    });
  }

  // 3. LIST TODAY
  if (
    /\b(bugun(?:un|ku|ki)?\s+(?:gorevleri|neler\s+var|planim|listem)|bugun\s+ne(?:ler)?\s+var|what(?:'s|\s+is|\s+do\s+i\s+have)?\s+(?:on\s+)?today|list\s+today(?:'s)?\s+tasks|today'?s\s+tasks)\b/i.test(
      ascii,
    )
  ) {
    return finish({
      intent: 'list_today',
      confidence: 0.94,
      destructive: false,
      requiresConfirmation: false,
      payload: { date: formatLocalDate(nowDate) },
    });
  }

  // 4. READ NOTE / RAG QUERY (Strictly Read-Only!)
  // Examples: "Lansmanla ilgili notumu oku", "Bana vergi ile ilgili notumu oku", "Read my note about launch"
  const trReadMatch = text.match(
    /^(?:bana\s+)?(.+?)(?:'?(?:la|le|yla|yle))?\s+(?:(?:ile\s+ilgili|hakk[ıi]nda(?:ki)?|ilgili)\s+)?(?:(?:notumu|notlar[ıi]m[ıi]|notu|g[öo]revimi|g[öo]revi)\s+)?(?:oku|s[öo]yle|[öo]zetle|nedir|ne\s+yaz[ıi]yor)$/iu,
  );
  const enReadMatch = text.match(
    /^(?:please\s+)?(?:read|summarize|tell\s+me|what\s+does)\s+(?:me\s+)?(?:my\s+)?(?:notes?|tasks?|about\s+)?(?:about\s+|on\s+|for\s+|regarding\s+)?(.+?)(?:\s+say)?\??$/iu,
  );
  if (trReadMatch || enReadMatch) {
    let query = cleanTitle((trReadMatch ? trReadMatch[1] : enReadMatch[1]) || '');
    // Strip Turkish instrumental suffix "-la/-le/-yla/-yle" when followed by "ilgili"
    if (trReadMatch) {
      query = query
        .replace(/(?<![\p{L}\p{N}_])(?:bana|benim|bu|su|şu)(?![\p{L}\p{N}_])/giu, ' ')
        .replace(
          /(?:ile\s+ilgili|hakk[ıi]nda(?:ki)?|ilgili|notumu|notlar[ıi]m[ıi]|notu|g[öo]revimi)$/iu,
          '',
        )
        .replace(/([a-zA-ZçğıöşüÇĞİÖŞÜ]{3,})(?:yla|yle|la|le)$/u, '$1')
        .trim();
    } else if (enReadMatch) {
      query = query
        .replace(/^(?:my\s+)?(?:note|notes|task|tasks)\s+(?:about|on|for|regarding)\s+/i, '')
        .replace(/^(?:about|on|for|regarding)\s+/i, '')
        .trim();
    }
    return finish({
      intent: 'read_note',
      confidence: query ? 0.92 : 0.72,
      destructive: false,
      requiresConfirmation: false,
      query,
      payload: { query },
    });
  }

  // 5. COMPLETE TASK
  const trCompMatch = text.match(
    /^(.+?)\s+(?:(?:g[öo]revini|g[öo]revi|i[şs]ini|i[şs]i)\s+)?(?:tamamla|bitir|bitti\s+i[şs]aretle|tamamland[ıi]\s+i[şs]aretle|yap[ıi]ld[ıi])$/iu,
  );
  const enCompMatch = text.match(
    /^(?:complete|finish|mark\s+done|check\s+off|done)\s+(?:task\s+)?(.+)$/iu,
  );
  if (trCompMatch || enCompMatch) {
    const selector = cleanTitle((trCompMatch ? trCompMatch[1] : enCompMatch[1]) || '');
    if (selector) {
      return finish({
        intent: 'complete_task',
        confidence: 0.91,
        destructive: false,
        requiresConfirmation: false,
        payload: { selector, completed: true },
      });
    }
  }

  // 6. SEARCH TASKS
  const trSearchMatch = text.match(
    /^(?:(?:g[öo]revler(?:im)?de|notlar(?:[ıi]m)?da)\s+)?(.+?)\s+(?:ara|bul|listele)$/iu,
  );
  const enSearchMatch = text.match(
    /^(?:search|find|lookup|look\s+up)\s+(?:for\s+)?(?:tasks?\s+|notes?\s+)?(.+)$/iu,
  );
  if (trSearchMatch || enSearchMatch) {
    const query = cleanTitle((trSearchMatch ? trSearchMatch[1] : enSearchMatch[1]) || '');
    if (query) {
      return finish({
        intent: 'search_tasks',
        confidence: 0.89,
        destructive: false,
        requiresConfirmation: false,
        query,
        payload: { query },
      });
    }
  }

  // 7. ADD TASK (Turkish + English natural language)
  const trAddPrefix =
    /^(?:notlar[ıi]ma|g[öo]revlerime|listeme|ajandama|yeni\s+g[öo]rev|yeni\s+not|g[öo]rev\s+ekle|not\s+ekle)\s+/iu;
  const trAddSuffix = /\s+(?:olarak\s+)?(?:ekle|kaydet|olu[şs]tur|not\s+al|hat[ıi]rlat)$/iu;
  const enAddPrefix =
    /^(?:add|create|new\s+task|new\s+note|remind\s+me\s+to|save\s+note|add\s+to\s+my\s+(?:notes|tasks|list))\s+/iu;

  const isTrAdd = trAddPrefix.test(text) || trAddSuffix.test(text);
  const isEnAdd = enAddPrefix.test(text);

  if (isTrAdd || isEnAdd) {
    let core = text;
    if (isTrAdd) {
      core = core.replace(trAddPrefix, '').replace(trAddSuffix, '').trim();
    } else {
      core = core.replace(enAddPrefix, '').trim();
    }
    const fields = extractUniversalTaskFields(core, nowDate);
    if (fields.cleaned) {
      return finish({
        intent: 'add_task',
        confidence: 0.93,
        destructive: false,
        requiresConfirmation: false,
        payload: {
          title: fields.cleaned,
          dueDate: fields.dueDate,
          dueTime: fields.dueTime,
          priority: fields.priority,
          important: fields.important,
          pinned: fields.pinned,
          category: fields.category,
          tags: fields.tags,
        },
      });
    }
  }

  // 8. UNIVERSAL 73-LANGUAGE ISO/SYMBOL + NATURAL SCHEDULE FAST PATH
  // (e.g. "Meeting 2026-12-05 10:30 #work !" or "Yarın saat 15'te doktor randevusu")
  const hasStructuredSignal =
    /\b\d{4}-\d{2}-\d{2}\b/.test(text) ||
    /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/.test(text) ||
    /(?:^|\s)(?:saat|at)\s+(?:[01]?\d|2[0-3])(?::[0-5]\d)?(?:'?(?:te|ta|de|da|e|a))?(?=\b|\s|$)/iu.test(
      text,
    ) ||
    /(?<![\p{L}\p{N}_])(bug[üu]n(?:[üu]n|e|k[üu]|[üu])?|yar[ıi]n(?:a|ki)?|[öo]b[üu]r\s+g[üu]n|today|tomorrow|day\s+after\s+tomorrow)(?![\p{L}\p{N}_])/iu.test(
      text,
    ) ||
    /(?:^|\s)#[\p{L}\p{N}_-]{1,28}/u.test(text) ||
    /(?:^|\s)\/[\p{L}\p{N}_-]{1,40}/u.test(text) ||
    /(?:^|\s)[!*^](?=\s|$)/.test(text);

  if (hasStructuredSignal) {
    const fields = extractUniversalTaskFields(text, nowDate);
    if (fields.cleaned) {
      return finish({
        intent: 'add_task',
        confidence: 0.88,
        destructive: false,
        requiresConfirmation: false,
        payload: {
          title: fields.cleaned,
          dueDate: fields.dueDate,
          dueTime: fields.dueTime,
          priority: fields.priority,
          important: fields.important,
          pinned: fields.pinned,
          category: fields.category,
          tags: fields.tags,
        },
      });
    }
  }

  // 9. Unmatched / ambiguous -> hand off to local LLM (or editable quick-add preview when LLM is absent)
  return finish({
    intent: 'unknown',
    confidence: norm.length > 0 ? 0.45 : 0,
    destructive: false,
    requiresConfirmation: false,
    query: text,
    payload: { title: text },
  });
}

// Pre-warm V8 Unicode regex JIT and ICU tr-TR case-folding tables on module load
// so the user's very first voice command parses in < 1 ms without a cold-start spike.
try {
  parseVoiceIntent("Notlarıma yarın 15:00'te test yüksek öncelik ekle");
} catch {
  // Ignore warm-up error
}

module.exports = {
  formatLocalDate,
  addDays,
  extractUniversalTaskFields,
  parseVoiceIntent,
};
