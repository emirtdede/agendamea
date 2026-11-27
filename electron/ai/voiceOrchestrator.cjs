'use strict';

/**
 * WBS-4.2: Secure Voice & Natural-Language Orchestrator
 * - Fast Path (< 50 ms) for high-confidence intents
 * - Strict Read-Only Isolation for read_note / search_tasks / readOnly mode (0 mutations possible!)
 * - Anti-Hallucination 0-match guard (minScore: 0.35 -> never calls LLM)
 * - Multi-match disambiguation (top-2 delta < 0.06 -> returns 1/2/3 choices)
 * - Mandatory Confirmation Lock on ALL destructive actions (delete, clear_completed, empty_trash, reset)
 */

const crypto = require('node:crypto');
const serverMessagesMod = require('../../shared/serverMessages.cjs');
const { parseVoiceIntent, formatLocalDate } = require('../../shared/voiceIntentParser.cjs');
const { prepareSpokenSummary } = require('./ttsService.cjs');

const DESTRUCTIVE_INTENTS = new Set(['delete_task', 'clear_completed', 'empty_trash', 'reset_all']);

function resolveVoiceLang(lang) {
  if (typeof lang === 'boolean') return lang ? 'tr' : 'en';
  return serverMessagesMod.normalizeServerLang(lang || 'en');
}

function tVoice(lang, key, vars) {
  let text = serverMessagesMod.getServerMessage(resolveVoiceLang(lang), key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

function formatReadFallback(matches, lang) {
  const top = matches[0];
  if (!top) {
    return tVoice(lang, 'voiceNoMatchingNote');
  }
  const bits = [top.title];
  if (top.dueDate) {
    bits.push(top.dueTime ? `${top.dueDate} ${top.dueTime}` : top.dueDate);
  }
  const snippet = String(top.matchedChunkText || top.notes || '').trim();
  if (snippet && snippet !== top.title) {
    bits.push(snippet);
  }
  return bits.join(' - ');
}

const MAX_PENDING_CONFIRMATIONS = 100;

class VoiceOrchestrator {
  constructor(options = {}) {
    this.pendingConfirmations = new Map();
    this.confirmationTtlMs = options.confirmationTtlMs || 60_000;
  }

  _issueConfirmationToken(action) {
    const now = Date.now();
    // Prune expired first
    for (const [k, v] of this.pendingConfirmations.entries()) {
      if (v.expiresAt < now) this.pendingConfirmations.delete(k);
    }
    while (this.pendingConfirmations.size >= MAX_PENDING_CONFIRMATIONS) {
      const oldest = this.pendingConfirmations.keys().next().value;
      if (oldest === undefined) break;
      this.pendingConfirmations.delete(oldest);
    }
    const token = crypto.randomBytes(12).toString('hex');
    const expiresAt = now + this.confirmationTtlMs;
    this.pendingConfirmations.set(token, { action, expiresAt });
    return token;
  }

  _consumeConfirmationToken(token) {
    const entry = this.pendingConfirmations.get(token);
    if (!entry) return null;
    this.pendingConfirmations.delete(token);
    if (entry.expiresAt < Date.now()) return null;
    return entry.action;
  }

  /**
   * @param {any} opts
   * @returns {Promise<any>}
   */
  async handleUtterance({
    text,
    language = 'en',
    readOnly = false,
    confirmToken = null,
    selectedTodoId = null,
    storeAdapter,
    ragSearchFn,
    llmService = null,
    now = new Date(),
  }) {
    const lang = resolveVoiceLang(language);

    // 0. Explicit Confirmation Execution Path (ONLY way a destructive action can execute)
    if (confirmToken && !readOnly) {
      const approved = this._consumeConfirmationToken(confirmToken);
      if (!approved) {
        const msg = tVoice(lang, 'voiceConfirmationExpired');
        return {
          ok: false,
          status: 'confirmation_expired',
          mutated: false,
          spokenText: msg,
          displayText: msg,
        };
      }
      return this._executeDestructiveAction(approved, storeAdapter, lang);
    }

    // 0B. Explicit Disambiguation Choice (user clicked chip 1/2/3 in overlay)
    if (selectedTodoId && typeof storeAdapter?.getTodoById === 'function') {
      const todo = await storeAdapter.getTodoById(selectedTodoId);
      if (!todo) {
        const msg = tVoice(lang, 'voiceNoMatchingNote');
        return {
          ok: true,
          status: 'not_found',
          intent: 'read_note',
          mutated: false,
          spokenText: msg,
          displayText: msg,
          matches: [],
        };
      }
      const fullText = formatReadFallback([todo], lang);
      const speech = prepareSpokenSummary(fullText);
      return {
        ok: true,
        status: 'answered',
        intent: 'read_note',
        readOnlyIsolated: true,
        mutated: false,
        spokenText: speech.spokenText,
        displayText: speech.fullText,
        ttsTruncated: speech.truncated,
        matches: [todo],
      };
    }

    const parsed = parseVoiceIntent(text, { now });
    let intent = parsed.intent;
    let confidence = parsed.confidence;
    let payload = parsed.payload || {};
    let query = parsed.query || '';
    let parserUsed = 'fast-path';

    // Optional LLM fallback ONLY when not in strict readOnly mode, Fast Path confidence < 0.85, and LLM is available
    if (
      !readOnly &&
      confidence < 0.85 &&
      llmService &&
      typeof llmService.isAvailable === 'function' &&
      llmService.isAvailable()
    ) {
      try {
        const extracted = await llmService.extractActionJson({
          utterance: text,
          language,
          todayDate: formatLocalDate(now),
        });
        if (extracted && typeof extracted.intent === 'string' && extracted.intent !== 'unknown') {
          intent = extracted.intent;
          confidence = Number(extracted.confidence) || 0.85;
          payload =
            extracted.payload &&
            typeof extracted.payload === 'object' &&
            !Array.isArray(extracted.payload)
              ? extracted.payload
              : {};
          query = typeof extracted.query === 'string' ? extracted.query : query;
          parserUsed = 'local-llm';
        }
      } catch {
        // Fall through to safe deterministic handling
      }
    }

    // 1. MANDATORY DESTRUCTIVE LOCK (R-14): Never execute delete / clear_completed / empty_trash / reset automatically!
    if (intent === 'reset_all') {
      const msg = tVoice(lang, 'voiceResetBlocked');
      return {
        ok: true,
        status: 'blocked',
        intent,
        destructive: true,
        requiresConfirmation: true,
        mutated: false,
        spokenText: msg,
        displayText: msg,
      };
    }

    if (DESTRUCTIVE_INTENTS.has(intent) || parsed.destructive) {
      if (readOnly) {
        const msg = tVoice(lang, 'voiceReadOnlyBlocked');
        return {
          ok: true,
          status: 'blocked_read_only',
          intent,
          requiresConfirmation: true,
          mutated: false,
          spokenText: msg,
          displayText: msg,
        };
      }
      const token = this._issueConfirmationToken({ intent, payload });
      const msg = tVoice(lang, 'voiceConfirmDeletePrompt');
      return {
        ok: true,
        status: 'confirmation_required',
        intent,
        destructive: true,
        requiresConfirmation: true,
        confirmationToken: token,
        mutated: false,
        payload,
        spokenText: msg,
        displayText: msg,
      };
    }

    // 2. LIST TODAY (strictly read-only - must execute BEFORE generic readOnly RAG fallback!)
    if (intent === 'list_today') {
      const todayTasks = await storeAdapter.listToday();
      if (!todayTasks || todayTasks.length === 0) {
        const msg = tVoice(lang, 'voiceNoTasksToday');
        return {
          ok: true,
          status: 'answered',
          intent: 'list_today',
          parser: parserUsed,
          readOnlyIsolated: true,
          mutated: false,
          spokenText: msg,
          displayText: msg,
          tasks: [],
        };
      }
      const listLine = todayTasks
        .slice(0, 5)
        .map((t, i) => `${i + 1}. ${t.title}${t.dueTime ? ` (${t.dueTime})` : ''}`)
        .join(', ');
      const msg = tVoice(lang, 'voiceTasksTodaySummary', {
        count: todayTasks.length,
        list: listLine,
      });
      const speech = prepareSpokenSummary(msg);
      return {
        ok: true,
        status: 'answered',
        intent: 'list_today',
        parser: parserUsed,
        readOnlyIsolated: true,
        mutated: false,
        spokenText: speech.spokenText,
        displayText: speech.fullText,
        ttsTruncated: speech.truncated,
        tasks: todayTasks,
      };
    }

    // 3. STRICT READ-ONLY MODE (read_note, search_tasks, or explicit readOnly flag)
    if (readOnly || intent === 'read_note' || intent === 'search_tasks') {
      const searchQ = (query || payload?.query || text || '').trim();
      const rag = await ragSearchFn(searchQ, { topK: 5, minScore: 0.35 });
      const hits = Array.isArray(rag?.hits) ? rag.hits : [];

      // R-15: 0-match anti-hallucination guard -> NEVER call LLM!
      if (hits.length === 0) {
        const msg = tVoice(lang, 'voiceNoMatchingNote');
        return {
          ok: true,
          status: 'not_found',
          intent: 'read_note',
          parser: parserUsed,
          readOnlyIsolated: true,
          llmCalled: false,
          mutated: false,
          spokenText: msg,
          displayText: msg,
          matches: [],
        };
      }

      // R-15: Multi-match disambiguation (top-2 score delta < 0.06)
      if (rag.disambiguationRequired && hits.length >= 2) {
        const topChoices = hits.slice(0, 3);
        const msg = tVoice(lang, 'voiceDisambiguateNotes', { count: topChoices.length });
        return {
          ok: true,
          status: 'disambiguation',
          intent: 'read_note',
          parser: parserUsed,
          readOnlyIsolated: true,
          llmCalled: false,
          mutated: false,
          spokenText: msg,
          displayText: msg,
          candidates: topChoices.map((h, i) => ({
            index: i + 1,
            todoId: h.todoId,
            title: h.title,
            score: h.score,
            snippet: h.matchedChunkText || h.notes || '',
          })),
        };
      }

      // Single clear match -> Isolated Read-Only LLM (tools: [] + <untrusted_note_data>) or direct deterministic read
      let answerText = formatReadFallback(hits, lang);
      let llmCalled = false;
      if (llmService && typeof llmService.isAvailable === 'function' && llmService.isAvailable()) {
        try {
          const llmRes = await llmService.answerReadOnlyRag({
            query: searchQ,
            chunks: hits.slice(0, 3),
            language: lang,
          });
          llmCalled = true;
          if (llmRes?.text) {
            answerText = llmRes.text;
          }
        } catch {
          // Graceful fallback to direct note read
        }
      }

      const speech = prepareSpokenSummary(answerText);
      return {
        ok: true,
        status: 'answered',
        intent: 'read_note',
        parser: parserUsed,
        readOnlyIsolated: true,
        toolsExposed: 0,
        llmCalled,
        mutated: false,
        spokenText: speech.spokenText,
        displayText: speech.fullText,
        ttsTruncated: speech.truncated,
        matches: hits,
        ragMode: rag.mode || 'fts5-only',
      };
    }

    // 4. SAFE MUTATIONS (add_task, complete_task, undo_trash)
    const validatedTitle =
      typeof payload?.title === 'string' ? payload.title.trim().slice(0, 300) : '';
    if (intent === 'add_task' && validatedTitle) {
      const validPriority =
        payload.priority === 'high' || payload.priority === 'low' || payload.priority === 'normal'
          ? payload.priority
          : 'normal';
      const created = await storeAdapter.addTask({
        title: validatedTitle,
        dueDate:
          typeof payload.dueDate === 'string' && payload.dueDate.trim()
            ? payload.dueDate.trim()
            : null,
        dueTime:
          typeof payload.dueTime === 'string' && payload.dueTime.trim()
            ? payload.dueTime.trim()
            : null,
        priority: validPriority,
        important: Boolean(payload.important),
        pinned: Boolean(payload.pinned),
        tags: Array.isArray(payload.tags)
          ? payload.tags.filter((x) => typeof x === 'string' && x.trim()).slice(0, 20)
          : [],
        category:
          typeof payload.category === 'string' && payload.category.trim()
            ? payload.category.trim()
            : undefined,
      });
      const schedulePart = [created.dueDate, created.dueTime].filter(Boolean).join(' ');
      const msg = `${tVoice(lang, 'voiceAddedPrefix')}: ${created.title}${schedulePart ? ` (${schedulePart})` : ''}`;
      return {
        ok: true,
        status: 'executed',
        intent: 'add_task',
        parser: parserUsed,
        mutated: true,
        todo: created,
        spokenText: msg,
        displayText: msg,
      };
    }

    const validatedSelector = typeof payload?.selector === 'string' ? payload.selector.trim() : '';
    if (intent === 'complete_task' && validatedSelector) {
      try {
        const updated = await storeAdapter.completeTask(validatedSelector, true);
        const msg = `${tVoice(lang, 'voiceCompletedPrefix')}: ${updated.title}`;
        return {
          ok: true,
          status: 'executed',
          intent: 'complete_task',
          parser: parserUsed,
          mutated: true,
          todo: updated,
          spokenText: msg,
          displayText: msg,
        };
      } catch {
        const msg = tVoice(lang, 'taskNotFound');
        return {
          ok: false,
          status: 'not_found',
          intent: 'complete_task',
          mutated: false,
          spokenText: msg,
          displayText: msg,
        };
      }
    }

    if (intent === 'undo_trash') {
      try {
        const restored = await storeAdapter.undoTrash();
        const name = restored?.item?.title || restored?.item?.name || '';
        const msg = `${tVoice(lang, 'voiceRestoredPrefix')}${name ? `: ${name}` : '.'}`;
        return {
          ok: true,
          status: 'executed',
          intent: 'undo_trash',
          parser: parserUsed,
          mutated: true,
          restored,
          spokenText: msg,
          displayText: msg,
        };
      } catch {
        const msg = tVoice(lang, 'voiceTrashEmpty');
        return {
          ok: true,
          status: 'not_found',
          intent: 'undo_trash',
          mutated: false,
          spokenText: msg,
          displayText: msg,
        };
      }
    }

    // 5. Low-confidence fallback (R-13): offer editable quick-add preview without unintended mutation
    const { extractUniversalTaskFields } = require('../../shared/voiceIntentParser.cjs');
    const previewRaw = String(payload?.title || text || '').trim();
    const parsedFields = extractUniversalTaskFields(previewRaw, now);
    const previewTitle = parsedFields.cleaned || previewRaw;
    return {
      ok: true,
      status: 'preview',
      intent: 'add_task',
      parser: parserUsed,
      mutated: false,
      payload: {
        title: previewTitle,
        dueDate: parsedFields.dueDate,
        dueTime: parsedFields.dueTime,
        priority: parsedFields.priority,
        important: parsedFields.important,
        pinned: parsedFields.pinned,
        category: parsedFields.category,
        tags: parsedFields.tags,
      },
      spokenText: tVoice(lang, 'voiceConfirmAddTask'),
      displayText: previewTitle,
    };
  }

  async _executeDestructiveAction(action, storeAdapter, langOrTr) {
    const lang = resolveVoiceLang(langOrTr);
    if (action.intent === 'delete_task' && action.payload?.scope === 'all') {
      const msg = tVoice(lang, 'voiceBulkDeleteBlocked');
      return {
        ok: true,
        status: 'blocked',
        intent: 'delete_task',
        mutated: false,
        spokenText: msg,
        displayText: msg,
      };
    }
    if (action.intent === 'delete_task' && action.payload?.selector) {
      try {
        const deleted = await storeAdapter.deleteTask(action.payload.selector);
        if (!deleted) {
          const msg = tVoice(lang, 'taskNotFound');
          return {
            ok: false,
            status: 'not_found',
            intent: 'delete_task',
            mutated: false,
            spokenText: msg,
            displayText: msg,
          };
        }
        const msg = `${tVoice(lang, 'voiceMovedToTrashPrefix')}: ${deleted?.title || action.payload.selector}`;
        return {
          ok: true,
          status: 'executed',
          intent: 'delete_task',
          mutated: true,
          spokenText: msg,
          displayText: msg,
        };
      } catch {
        const msg = tVoice(lang, 'taskNotFound');
        return {
          ok: false,
          status: 'not_found',
          intent: 'delete_task',
          mutated: false,
          spokenText: msg,
          displayText: msg,
        };
      }
    }
    if (action.intent === 'clear_completed') {
      try {
        const res = await storeAdapter.clearCompleted();
        const msg = tVoice(lang, 'voiceCompletedMovedToTrash');
        return {
          ok: true,
          status: 'executed',
          intent: 'clear_completed',
          mutated: true,
          result: res,
          spokenText: msg,
          displayText: msg,
        };
      } catch {
        const msg = tVoice(lang, 'clearCompletedFailed');
        return {
          ok: false,
          status: 'blocked',
          intent: 'clear_completed',
          mutated: false,
          spokenText: msg,
          displayText: msg,
        };
      }
    }
    if (action.intent === 'empty_trash') {
      try {
        const res = await storeAdapter.emptyTrash();
        const msg = tVoice(lang, 'voiceTrashEmptied');
        return {
          ok: true,
          status: 'executed',
          intent: 'empty_trash',
          mutated: true,
          result: res,
          spokenText: msg,
          displayText: msg,
        };
      } catch {
        const msg = tVoice(lang, 'trashEmptyFailed');
        return {
          ok: false,
          status: 'blocked',
          intent: 'empty_trash',
          mutated: false,
          spokenText: msg,
          displayText: msg,
        };
      }
    }
    const msg = tVoice(lang, 'voiceActionCancelled');
    return {
      ok: false,
      status: 'blocked',
      intent: action.intent,
      mutated: false,
      spokenText: msg,
      displayText: msg,
    };
  }
}

module.exports = {
  VoiceOrchestrator,
  DESTRUCTIVE_INTENTS,
  formatReadFallback,
};
