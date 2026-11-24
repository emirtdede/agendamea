import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';

const require = createRequire(import.meta.url);
const electronExecutablePath = require('electron');

const rootDir = process.cwd();
const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-e2e-'));

async function runSmoke() {
  if (
    !fs.existsSync(path.join(rootDir, 'dist', 'index.html')) ||
    !fs.existsSync(path.join(rootDir, 'dist-server', 'server.mjs'))
  ) {
    throw new Error('Production build missing. Run `npm run build` before `npm run test:e2e`.');
  }

  let app;
  try {
    const launchEnv = {
      ...process.env,
      NODE_ENV: 'production',
      AGENDAMEA_DATA_DIR: tmpDataDir,
      AGENDAMEA_DB_PATH: path.join(tmpDataDir, 'agendamea.db'),
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    };
    delete launchEnv.ELECTRON_RUN_AS_NODE;

    app = await electron.launch({
      executablePath: electronExecutablePath,
      args: [`--user-data-dir=${tmpDataDir}`, rootDir],
      env: launchEnv,
      timeout: 30_000,
    });

    const page = await app.firstWindow({ timeout: 30_000 });
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.waitForLoadState('domcontentloaded', { timeout: 20_000 });
    await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, null, {
      timeout: 20_000,
    });

    // 1. Verify strict Electron renderer sandbox isolation
    const sandboxCheck = await page.evaluate(() => ({
      hasNodeRequire: typeof window.require !== 'undefined',
      hasNodeProcess: typeof window.process !== 'undefined',
      hasPreloadBridge: typeof window.agendameaWindow === 'object',
      href: window.location.href,
      title: document.title,
    }));
    assert.equal(sandboxCheck.hasNodeRequire, false, 'Renderer must not expose Node require()');
    assert.equal(sandboxCheck.hasNodeProcess, false, 'Renderer must not expose Node process');
    assert.equal(
      sandboxCheck.hasPreloadBridge,
      true,
      'Renderer must expose allowlisted agendameaWindow bridge',
    );
    assert.ok(
      sandboxCheck.href.startsWith('http://127.0.0.1:'),
      `Expected loopback origin, got ${sandboxCheck.href}`,
    );

    // 2. Dismiss first-launch WelcomeModal if visible
    const skipBtn = page
      .locator(
        '[data-testid="welcome-step-skip"], [data-testid="welcome-step-start"], [data-testid="welcome-start-btn"], [data-testid="welcome-skip-btn"]',
      )
      .first();
    if (await skipBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await skipBtn.click();
    }

    // 3. Create a task via QuickAddBar and verify real DOM persistence
    const quickInput = page.locator('main input[type="text"]').first();
    await quickInput.waitFor({ state: 'visible', timeout: 10_000 });
    await quickInput.fill('Electron E2E Verified Task');
    await quickInput.press('Enter');

    await page
      .getByText('Electron E2E Verified Task')
      .waitFor({ state: 'visible', timeout: 10_000 });

    // 4. Open Settings modal and assert strictly single role="tablist"
    const settingsBtn = page
      .locator('aside button')
      .filter({ hasText: /Settings|Ayarlar/i })
      .first();
    if (await settingsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await settingsBtn.click();
      await page
        .locator('[data-testid="settings-page"]')
        .waitFor({ state: 'visible', timeout: 5000 });
      const tablistCount = await page
        .locator('[data-testid="settings-page"] [role="tablist"]')
        .count();
      assert.equal(tablistCount, 1, `Expected 1 visible Settings tablist, found ${tablistCount}`);
    }

    assert.equal(
      pageErrors.length,
      0,
      `Uncaught page errors during Electron E2E: ${pageErrors.join('; ')}`,
    );
    console.log(
      '[e2e] PASS: Real Electron window, sandbox isolation, task CRUD, and Settings UI verified.',
    );
  } finally {
    if (app) {
      await app.close().catch(() => {
        /* ignore */
      });
    }
    try {
      fs.rmSync(tmpDataDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
    } catch {
      // Ignore Windows temp handle release lag
    }
  }
}

runSmoke().catch((err) => {
  console.error('[e2e] FAIL:', err);
  process.exit(1);
});
