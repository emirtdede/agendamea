'use strict';

/**
 * WBS-2.2 & WBS-2.3: Shared Chunked Hybrid RAG Utilities
 * - 256-token / 32-token overlap chunking so 10,000-char notes are 100% indexed (zero truncation)
 * - Deterministic SHA-256 content_hash caching
 * - Safe SQLite FTS5 query builder (immune to injection / FTS5 syntax errors)
 * - Pure-JS L2-normalized Float32 cosine similarity + Reciprocal Rank Fusion (k=60)
 */

const crypto = require('node:crypto');

const DEFAULT_CHUNK_TOKENS = 256;
const DEFAULT_OVERLAP_TOKENS = 32;
const RRF_K = 60;
const DEFAULT_MIN_SCORE = 0.35;
const DISAMBIGUATION_DELTA = 0.06;

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTodoDocumentText(todo) {
  if (!todo || typeof todo !== 'object') return '';
  const parts = [];
  if (todo.title) parts.push(String(todo.title).trim());
  if (todo.notes) parts.push(String(todo.notes).trim());
  if (Array.isArray(todo.tags) && todo.tags.length > 0) {
    parts.push(todo.tags.map((t) => `#${String(t).replace(/^#+/, '')}`).join(' '));
  }
  if (Array.isArray(todo.subtasks) && todo.subtasks.length > 0) {
    const subText = todo.subtasks
      .map((s) => String(s?.title || '').trim())
      .filter(Boolean)
      .join('; ');
    if (subText) parts.push(subText);
  }
  return parts.filter(Boolean).join('\n').trim();
}

/**
 * Splits a task's full text (up to 10,000+ chars) into overlapping word-token chunks
 * (~256 tokens per chunk, 32-token overlap) so long notes never truncate at 512 tokens.
 */
function chunkTaskDocument(todo, options = {}) {
  const maxTokens = Math.max(32, Number(options.maxTokens) || DEFAULT_CHUNK_TOKENS);
  const overlapTokens = Math.max(0, Math.min(maxTokens - 8, Number(options.overlapTokens) || DEFAULT_OVERLAP_TOKENS));
  const fullText = typeof todo === 'string' ? todo.trim() : buildTodoDocumentText(todo);
  if (!fullText) return [];

  const titlePrefix =
    typeof todo === 'object' && todo?.title ? `${String(todo.title).trim()}: ` : '';

  // Tokenize preserving words and punctuation tokens while capping single ultra-long words
  const rawTokens = fullText.split(/\s+/).filter(Boolean);
  const tokens = [];
  for (const tok of rawTokens) {
    if (tok.length > 48) {
      for (let i = 0; i < tok.length; i += 32) {
        tokens.push(tok.slice(i, i + 32));
      }
    } else {
      tokens.push(tok);
    }
  }

  if (tokens.length <= maxTokens) {
    const chunkText = tokens.join(' ');
    return [
      {
        chunkIndex: 0,
        chunkText,
        contentHash: computeChunkHash(chunkText),
        tokenCount: tokens.length,
      },
    ];
  }

  const step = Math.max(1, maxTokens - overlapTokens);
  const chunks = [];
  let idx = 0;
  for (let start = 0; start < tokens.length; start += step) {
    const slice = tokens.slice(start, start + maxTokens);
    if (slice.length === 0) break;
    const body = slice.join(' ');
    const chunkText = idx > 0 && titlePrefix ? `${titlePrefix}${body}` : body;
    chunks.push({
      chunkIndex: idx,
      chunkText,
      contentHash: computeChunkHash(chunkText),
      tokenCount: slice.length,
    });
    idx += 1;
    if (start + maxTokens >= tokens.length) break;
  }
  return chunks;
}

function computeChunkHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function l2Normalize(vec) {
  const arr = vec instanceof Float32Array ? vec : Float32Array.from(vec || []);
  let sumSq = 0;
  for (let i = 0; i < arr.length; i += 1) {
    sumSq += arr[i] * arr[i];
  }
  const norm = Math.sqrt(sumSq);
  if (!Number.isFinite(norm) || norm === 0) return new Float32Array(arr.length);
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i += 1) {
    out[i] = arr[i] / norm;
  }
  return out;
}

function encodeFloat32Blob(vec) {
  const arr = vec instanceof Float32Array ? vec : Float32Array.from(vec || []);
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

function decodeFloat32Blob(buf) {
  if (!buf) return new Float32Array(0);
  const nodeBuf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (nodeBuf.byteLength === 0 || nodeBuf.byteLength % 4 !== 0) return new Float32Array(0);
  const copy = new Uint8Array(nodeBuf.byteLength);
  copy.set(nodeBuf);
  return new Float32Array(copy.buffer);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (!Number.isFinite(denom) || denom === 0) return 0;
  return dot / denom;
}

/**
 * Converts arbitrary user query text into a safe SQLite FTS5 MATCH expression.
 * Strips all FTS5 control chars and returns null if no searchable tokens remain.
 */
function buildFtsQuery(rawQuery) {
  const clean = String(rawQuery || '')
    .replace(/["'()*^:{}[\];<>\\/!@#$%&=+?~`|,.-]+/g, ' ')
    .trim();
  if (!clean) return null;
  const rawTerms = clean
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 12);

  if (rawTerms.length === 0) {
    const single = clean.replace(/\s+/g, '');
    return single ? `"${single}"*` : null;
  }
  // Use OR between prefix-quoted tokens so partial natural language queries ("vergi iade kodu XYZ") still recall accurately
  return rawTerms.map((term) => `"${term}"*`).join(' OR ');
}

function normalizeQueryTokens(rawQuery) {
  const clean = String(rawQuery || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
    .trim();
  if (!clean) return [];
  return Array.from(new Set(clean.split(/\s+/).filter((t) => t.length >= 2)));
}

function computeLexicalCoverage(query, text) {
  const tokens = normalizeQueryTokens(query);
  if (tokens.length === 0) return 0;
  const hay = String(text || '').toLocaleLowerCase('tr-TR');
  let hits = 0;
  for (const tok of tokens) {
    if (hay.includes(tok)) hits += 1;
  }
  return hits / tokens.length;
}

/**
 * Reciprocal Rank Fusion (k=60) combining FTS5 BM25 hits and chunk max-pooling vector cosine hits.
 * Returns normalized score in [0, 1], filters below minScore, and flags disambiguation when top-2 delta < 0.06.
 * @param {{ query?: string; ftsHits?: any[]; vectorHits?: any[]; k?: number; minScore?: number; topK?: number }} opts
 */
function fuseHybridRanks({
  query = '',
  ftsHits = [],
  vectorHits = [],
  k = RRF_K,
  minScore = DEFAULT_MIN_SCORE,
  topK = 5,
}) {
  const byTodo = new Map();

  const ensureEntry = (todoId) => {
    let entry = byTodo.get(todoId);
    if (!entry) {
      entry = {
        todoId,
        ftsRank: null,
        bm25: null,
        vectorRank: null,
        cosine: 0,
        rrf: 0,
        matchedChunkText: '',
        matchedChunkIndex: 0,
        lexicalCoverage: 0,
      };
      byTodo.set(todoId, entry);
    }
    return entry;
  };

  ftsHits.forEach((hit, idx) => {
    const entry = ensureEntry(hit.todoId);
    entry.ftsRank = idx + 1;
    entry.bm25 = typeof hit.bm25 === 'number' ? hit.bm25 : null;
    entry.rrf += 1 / (k + idx + 1);
    if (hit.snippet && !entry.matchedChunkText) {
      entry.matchedChunkText = hit.snippet;
    }
    if (typeof hit.lexicalCoverage === 'number') {
      entry.lexicalCoverage = Math.max(entry.lexicalCoverage, hit.lexicalCoverage);
    }
  });

  // Vector hits already max-pooled per todoId, sorted descending by cosine
  vectorHits.forEach((hit, idx) => {
    const entry = ensureEntry(hit.todoId);
    entry.vectorRank = idx + 1;
    entry.cosine = Math.max(entry.cosine, Number(hit.cosine || 0));
    entry.rrf += 1 / (k + idx + 1);
    if (hit.chunkText) {
      entry.matchedChunkText = hit.chunkText;
      entry.matchedChunkIndex = Number(hit.chunkIndex || 0);
    }
  });

  const hasBoth = ftsHits.length > 0 && vectorHits.length > 0;
  const maxPossibleRrf = hasBoth ? 2 / (k + 1) : 1 / (k + 1);

  const scored = Array.from(byTodo.values())
    .map((entry) => {
      const rrfNorm = Math.min(1, entry.rrf / maxPossibleRrf);
      let score;
      if (entry.ftsRank !== null && entry.vectorRank !== null) {
        score = Math.min(1, 0.55 * rrfNorm + 0.30 * Math.max(0, entry.cosine) + 0.15 * entry.lexicalCoverage);
      } else if (entry.vectorRank !== null) {
        score = Math.max(0, Math.min(1, entry.cosine));
      } else {
        // Pure FTS5 fallback score combines lexical token coverage and rank signal
        const cov = entry.lexicalCoverage || computeLexicalCoverage(query, entry.matchedChunkText);
        score = Math.min(1, 0.55 * cov + 0.45 * rrfNorm);
      }
      return {
        ...entry,
        score: Math.round(score * 1000) / 1000,
      };
    })
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, topK));

  const disambiguationRequired =
    scored.length >= 2 && Math.abs(scored[0].score - scored[1].score) < DISAMBIGUATION_DELTA;

  return {
    hits: scored,
    disambiguationRequired,
    mode: vectorHits.length > 0 ? 'hybrid-rrf' : 'fts5-only',
  };
}

module.exports = {
  DEFAULT_CHUNK_TOKENS,
  DEFAULT_OVERLAP_TOKENS,
  RRF_K,
  DEFAULT_MIN_SCORE,
  DISAMBIGUATION_DELTA,
  normalizeText,
  buildTodoDocumentText,
  chunkTaskDocument,
  computeChunkHash,
  l2Normalize,
  encodeFloat32Blob,
  decodeFloat32Blob,
  cosineSimilarity,
  buildFtsQuery,
  normalizeQueryTokens,
  computeLexicalCoverage,
  fuseHybridRanks,
};
