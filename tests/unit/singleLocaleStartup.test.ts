import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { TodoDatabase } from '../../src/db/database';

test('Setup language parity: fresh DB honors AGENDAMEA_INITIAL_LOCALE and AGENDAMEA_INSTALLER_LOCALE override', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-setup-lang-'));
  const dbPath = path.join(tmpDir, 'agendamea.db');
  const prevInitial = process.env.AGENDAMEA_INITIAL_LOCALE;
  const prevInstaller = process.env.AGENDAMEA_INSTALLER_LOCALE;

  try {
    // 1. Fresh DB opened with German Setup initial locale boots directly in 'de'
    process.env.AGENDAMEA_INITIAL_LOCALE = 'de-DE';
    delete process.env.AGENDAMEA_INSTALLER_LOCALE;
    const db1 = new TodoDatabase(dbPath);
    try {
      assert.equal(db1.getSettings().language, 'de');
    } finally {
      db1.close();
    }

    // 2. Subsequent normal launch preserves user's saved language even if OS locale differs
    process.env.AGENDAMEA_INITIAL_LOCALE = 'fr-FR';
    delete process.env.AGENDAMEA_INSTALLER_LOCALE;
    const db2 = new TodoDatabase(dbPath);
    try {
      assert.equal(db2.getSettings().language, 'de');
    } finally {
      db2.close();
    }

    // 3. Explicit Setup re-run with AGENDAMEA_INSTALLER_LOCALE overrides DB language immediately
    process.env.AGENDAMEA_INITIAL_LOCALE = 'en-US';
    process.env.AGENDAMEA_INSTALLER_LOCALE = 'ja';
    const db3 = new TodoDatabase(dbPath);
    try {
      assert.equal(db3.getSettings().language, 'ja');
    } finally {
      db3.close();
    }
  } finally {
    if (prevInitial === undefined) delete process.env.AGENDAMEA_INITIAL_LOCALE;
    else process.env.AGENDAMEA_INITIAL_LOCALE = prevInitial;
    if (prevInstaller === undefined) delete process.env.AGENDAMEA_INSTALLER_LOCALE;
    else process.env.AGENDAMEA_INSTALLER_LOCALE = prevInstaller;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
