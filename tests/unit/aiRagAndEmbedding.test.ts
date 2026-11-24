import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import embeddingWorkerMod from '../../electron/ai/embeddingWorker.cjs';
import ragChunker from '../../shared/ragChunker.cjs';
import { TodoDatabase } from '../../src/db/database';

test('WBS-2.2: Schema v3 -> v4 upgrade, 9,500-char chunking (XYZ-99 at tail) & importBackup FTS5 rebuild', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-v4-'));
  const dbPath = path.join(tmpDir, 'v3-upgrade.db');
  try {
    // Seed a real v3 database
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, deleted_at TEXT DEFAULT NULL);
      CREATE TABLE todos (id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', completed INTEGER NOT NULL DEFAULT 0, important INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'normal', start_date TEXT DEFAULT NULL, due_date TEXT, due_time TEXT DEFAULT NULL, tags TEXT NOT NULL DEFAULT '[]', category_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT DEFAULT NULL);
      CREATE TABLE subtasks (id TEXT PRIMARY KEY, todo_id TEXT NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO todos VALUES ('v3-t1', 'Eski V3 Gorevi', 'Mevcut not verisi', 0, 0, 0, 'normal', NULL, NULL, NULL, '[]', NULL, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL);
    `);
    legacy.pragma('user_version = 3');
    legacy.close();

    const db = new TodoDatabase(dbPath);
    try {
      assert.equal(db.getRawDb().pragma('user_version', { simple: true }), 5);
      assert.equal(db.getTodos().length, 1);

      // Add a 9,500-character note with "vergi iade kodu XYZ-99" in the final paragraph!
      const filler = 'finansal analiz toplantisi detayli proje planlama raporu '.repeat(162); // ~9,234 chars
      const longNotes = `${filler}\nSon paragraf: vergi iade kodu XYZ-99 muhasebeye iletilecek.`;
      assert.ok(longNotes.length >= 9000);

      const longTodo = db.createTodo({ title: 'Yillik Mali Dosya', notes: longNotes });
      const chunks = ragChunker.chunkTaskDocument(longTodo);
      assert.ok(chunks.length >= 4, `Expected >= 4 overlapping chunks, got ${chunks.length}`);
      assert.ok(chunks[chunks.length - 1]?.chunkText.includes('XYZ-99'));

      const search1 = db.searchHybridRag('vergi iade kodu XYZ-99');
      assert.ok(search1.hits.length >= 1);
      assert.equal(search1.hits[0]?.todoId, longTodo.id);
      assert.ok(search1.hits[0]?.matchedChunkText.includes('XYZ-99'));

      // Export -> Reset -> Import -> FTS5 must rebuild cleanly and still find XYZ-99
      const snap = db.getBootstrap();
      db.resetAllData({ resetSettings: false });
      assert.equal(db.searchHybridRag('XYZ-99').hits.length, 0);
      db.importBackup(snap);
      const searchAfterImport = db.searchHybridRag('XYZ-99');
      assert.equal(searchAfterImport.hits.length, 1);
      assert.equal(searchAfterImport.hits[0]?.todoId, longTodo.id);
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 50 });
  }
});

test('WBS-2.3: GGUF Embedding content_hash cache (recomputed === 0 on unchanged), non-blocking yield & FTS5 fallback', async () => {
  const db = new TodoDatabase(':memory:');
  try {
    for (let i = 0; i < 25; i += 1) {
      db.createTodo({ title: `Gorev ${i}`, notes: `Icerik numarasi ${i} butce raporu` });
    }
    const todos = db.getTodos();
    let embedCalls = 0;
    const deterministicEmbed = async (text: string) => {
      embedCalls += 1;
      const vec = new Float32Array(8);
      for (let i = 0; i < text.length; i += 1) {
        const idx = i % 8;
        vec[idx] = (vec[idx] ?? 0) + (text.charCodeAt(i) % 31) / 31;
      }
      return vec;
    };

    const worker = new embeddingWorkerMod.EmbeddingService({
      modelId: 'multilingual-e5-small-q8_0',
      embedFn: deterministicEmbed,
      batchSize: 5,
      yieldMs: 2,
    });

    const first = await worker.syncTodosIndex(db.getRawDb(), todos);
    assert.equal(first.ok, true);
    assert.equal(first.recomputed, 25);
    assert.equal(embedCalls, 25);

    // Second sync with unchanged tasks must skip 100% via content_hash!
    const second = await worker.syncTodosIndex(db.getRawDb(), todos);
    assert.equal(second.ok, true);
    assert.equal(second.recomputed, 0);
    assert.equal(second.skipped, 25);
    assert.equal(embedCalls, 25);

    // Hybrid search with vector hits returns hybrid-rrf
    const vectorHits = await worker.searchVectors(db.getRawDb(), 'butce raporu', { topK: 5 });
    assert.ok(vectorHits.length > 0);
    const hybrid = db.searchHybridRag('butce raporu', { vectorHits });
    assert.equal(hybrid.mode, 'hybrid-rrf');
    assert.ok(hybrid.hits.length > 0);

    // Model-less fallback returns fts5-only without errors
    const noModelWorker = new embeddingWorkerMod.EmbeddingService({ modelPath: null });
    const noModelSync = await noModelWorker.syncTodosIndex(db.getRawDb(), todos);
    assert.equal(noModelSync.mode, 'fts5-only');
    const ftsFallback = db.searchHybridRag('butce raporu');
    assert.equal(ftsFallback.mode, 'fts5-only');
    assert.ok(ftsFallback.hits.length > 0);
  } finally {
    db.close();
  }
});

test('WBS-5.4 OFFLINE PARITY: localStore offline AI settings, voiceShortcut window-prefs sync & FTS5 importBackup rebuild', async () => {
  const localStore = (await import('../../shared/localStore.cjs')).default;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-offline-ai-'));
  const prevDataDir = process.env.AGENDAMEA_DATA_DIR;
  const prevOffline = process.env.AGENDAMEA_FORCE_OFFLINE;
  process.env.AGENDAMEA_DATA_DIR = tmpDir;
  process.env.AGENDAMEA_FORCE_OFFLINE = '1';

  try {
    const updated = await localStore.updateSettings({
      aiTier: 'tier-medium',
      aiLlmModelId: 'qwen3-4b-q4_k_m',
      voiceShortcut: 'Alt+Shift+Space',
      voiceAutoStopMs: 2200,
      voiceTtsEnabled: false,
    });
    assert.equal(updated.aiTier, 'tier-medium');
    assert.equal(updated.aiLlmModelId, 'qwen3-4b-q4_k_m');
    assert.equal(updated.voiceShortcut, 'Alt+Shift+Space');
    assert.equal(updated.voiceAutoStopMs, 2200);
    assert.equal(updated.voiceTtsEnabled, false);

    // Verify Electron window-prefs.json synced voiceShortcut cleanly
    const prefs = JSON.parse(fs.readFileSync(path.join(tmpDir, 'window-prefs.json'), 'utf8'));
    assert.equal(prefs.voiceShortcut, 'Alt+Shift+Space');

    // Verify offline importBackup & resetAllData rebuild todos_fts cleanly
    await localStore.addTask({ title: 'Offline RAG Test', notes: 'Ozel kod OMEGA-77' });
    const backup = await localStore.exportBackup();
    await localStore.resetAllData({ resetSettings: false });
    const afterReset = await localStore.semanticSearchRag('OMEGA-77');
    assert.equal(afterReset.hits.length, 0);

    await localStore.importBackup(backup);
    const afterImport = await localStore.semanticSearchRag('OMEGA-77');
    assert.equal(afterImport.hits.length, 1);
    assert.equal(afterImport.hits[0].title, 'Offline RAG Test');
  } finally {
    if (prevDataDir === undefined) delete process.env.AGENDAMEA_DATA_DIR;
    else process.env.AGENDAMEA_DATA_DIR = prevDataDir;
    if (prevOffline === undefined) delete process.env.AGENDAMEA_FORCE_OFFLINE;
    else process.env.AGENDAMEA_FORCE_OFFLINE = prevOffline;
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 50 });
  }
});
