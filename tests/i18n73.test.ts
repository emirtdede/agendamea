import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { SUPPORTED_LANGUAGES } from '../src/i18n/languages.ts';
import { getDictionary, getLegalDocuments } from '../src/i18n/localesWorld.ts';
import {
  EN_DICTIONARY,
  EN_LEGAL_DOCUMENTS,
  type LegalDocId,
  TR_DICTIONARY,
} from '../src/i18n/translations.ts';

const require = createRequire(import.meta.url);
const cliMessages = require('../shared/cliMessages.cjs');
const serverMessages = require('../shared/serverMessages.cjs');

const FORBIDDEN_DASH_RE = /[\u2013\u2014]/;
const FORBIDDEN_EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u;

const EXPECTED_LEGAL_SHAPE: Record<LegalDocId, number[]> = {
  privacy: [4, 1, 3],
  terms: [1, 1, 2],
  gdpr: [1, 1, 2],
  opensource: [1, 1],
  accessibility: [1, 1, 2],
};

test('73-language Desktop UI: all 821 keys non-empty, zero em/en-dash, zero emoji, zero TR/EN leakage', () => {
  assert.equal(SUPPORTED_LANGUAGES.length, 73);
  const keys = Object.keys(EN_DICTIONARY) as Array<keyof typeof EN_DICTIONARY>;
  assert.equal(keys.length, 821);

  for (const meta of SUPPORTED_LANGUAGES) {
    const dict = getDictionary(meta.code);
    for (const key of keys) {
      const val = dict[key];
      assert.equal(typeof val, 'string', `${meta.code}.${key} must be string`);
      assert.ok(val.trim().length > 0, `${meta.code}.${key} must be non-empty`);
      assert.ok(!FORBIDDEN_DASH_RE.test(val), `${meta.code}.${key} contains forbidden em/en-dash`);
      assert.ok(!FORBIDDEN_EMOJI_RE.test(val), `${meta.code}.${key} contains forbidden emoji`);
      if (meta.code !== 'tr') {
        assert.notEqual(
          val.length >= 25 && val === TR_DICTIONARY[key],
          true,
          `${meta.code}.${key} leaked Turkish fallback`,
        );
      }
      if (meta.code !== 'en' && meta.code !== 'tr' && key !== 'docsMcpFormatStandard') {
        assert.notEqual(
          val.length >= 40 && val === EN_DICTIONARY[key],
          true,
          `${meta.code}.${key} leaked untranslated English fallback`,
        );
      }
    }
    assert.ok(
      !dict.instantSaveBadge.toLowerCase().includes('sqlite'),
      `${meta.code}.instantSaveBadge must not mention sqlite`,
    );
  }
});

test('73-language Legal Docs: all 5 full multi-section legal documents match canonical structure', () => {
  const docIds: LegalDocId[] = ['privacy', 'terms', 'gdpr', 'opensource', 'accessibility'];
  for (const meta of SUPPORTED_LANGUAGES) {
    const docs = getLegalDocuments(meta.code);
    for (const docId of docIds) {
      const doc = docs[docId];
      assert.ok(doc, `${meta.code}.legal.${docId} missing`);
      assert.ok(doc.title.trim().length > 0, `${meta.code}.legal.${docId}.title empty`);
      assert.ok(doc.subtitle.trim().length > 0, `${meta.code}.legal.${docId}.subtitle empty`);
      const expParas = EXPECTED_LEGAL_SHAPE[docId];
      assert.equal(
        doc.sections.length,
        expParas.length,
        `${meta.code}.legal.${docId} section count mismatch`,
      );
      doc.sections.forEach((sec, si) => {
        assert.ok(
          sec.heading.trim().length > 0,
          `${meta.code}.legal.${docId}.s${si} heading empty`,
        );
        assert.ok(
          !FORBIDDEN_DASH_RE.test(sec.heading),
          `${meta.code}.legal.${docId}.s${si} heading has forbidden dash`,
        );
        assert.equal(
          sec.paragraphs.length,
          expParas[si],
          `${meta.code}.legal.${docId}.s${si} paragraph count mismatch`,
        );
        sec.paragraphs.forEach((p, pi) => {
          assert.ok(p.trim().length > 0, `${meta.code}.legal.${docId}.s${si}.p${pi} empty`);
          assert.ok(
            !FORBIDDEN_DASH_RE.test(p),
            `${meta.code}.legal.${docId}.s${si}.p${pi} has forbidden dash`,
          );
        });
      });
      if (meta.code !== 'en') {
        assert.notEqual(
          doc.sections[0]?.heading,
          EN_LEGAL_DOCUMENTS[docId].sections[0]?.heading,
          `${meta.code}.legal.${docId} fell back to English`,
        );
      }
    }
  }
});

test('73-language Installer locales.json: all 73 languages x 35 keys, zero dot-glue, zero em/en-dash', () => {
  const localesPath = path.resolve(
    process.cwd(),
    'installer/Agendamea.Setup/Localization/locales.json',
  );
  const entries = JSON.parse(fs.readFileSync(localesPath, 'utf8')) as Array<Record<string, string>>;
  assert.equal(entries.length, 73);
  const byCode = new Map(entries.map((e) => [e.code, e]));

  for (const meta of SUPPORTED_LANGUAGES) {
    const entry = byCode.get(meta.code);
    assert.ok(entry, `Missing installer locale ${meta.code}`);
    assert.ok(
      entry.closeOptionsTooltip && entry.closeOptionsTooltip.trim().length > 0,
      `${meta.code}.closeOptionsTooltip missing`,
    );
    for (const [k, v] of Object.entries(entry)) {
      assert.ok(typeof v === 'string' && v.trim().length > 0, `installer.${meta.code}.${k} empty`);
      assert.ok(!FORBIDDEN_DASH_RE.test(v), `installer.${meta.code}.${k} has forbidden dash`);
      assert.ok(!FORBIDDEN_EMOJI_RE.test(v), `installer.${meta.code}.${k} has forbidden emoji`);
      if (k !== 'footerText') {
        assert.ok(!v.includes(' · '), `installer.${meta.code}.${k} has synthetic dot-glue: ${v}`);
      }
    }
    if (meta.code !== 'en') {
      assert.notEqual(
        entry.diskRequiredLabel,
        'Disk',
        `installer.${meta.code}.diskRequiredLabel must not be fallback "Disk"`,
      );
    }
  }
});

test('73-language CLI & Server locales: all 73 languages load cleanly with intact placeholders', () => {
  for (const meta of SUPPORTED_LANGUAGES) {
    const labels = cliMessages.getCliLabels(meta.code, '1.1.0');
    const msgs = cliMessages.getCliMessages(meta.code);
    assert.ok(Object.keys(labels).length >= 68, `CLI labels count for ${meta.code}`);
    assert.ok(Object.keys(msgs).length >= 57, `CLI messages count for ${meta.code}`);
    assert.ok(labels.shortHelp.includes('1.1.0'), `CLI shortHelp version for ${meta.code}`);
    assert.ok(labels.fullHelp.includes('1.1.0'), `CLI fullHelp version for ${meta.code}`);
    assert.ok(msgs.viewExpiredWarn.includes('{min}'), `CLI {min} placeholder for ${meta.code}`);
    assert.ok(
      msgs.viewOutOfRange.includes('{idx}') &&
        msgs.viewOutOfRange.includes('{view}') &&
        msgs.viewOutOfRange.includes('{max}'),
      `CLI viewOutOfRange placeholders for ${meta.code}`,
    );

    const srv = serverMessages.getServerMessages(meta.code) as Record<string, string>;
    assert.equal(Object.keys(srv).length, 142, `Server messages count for ${meta.code}`);
    for (const [k, v] of Object.entries(srv)) {
      assert.ok(typeof v === 'string' && v.trim().length > 0, `server.${meta.code}.${k} empty`);
      assert.ok(!FORBIDDEN_DASH_RE.test(v), `server.${meta.code}.${k} has forbidden dash`);
    }
    if (meta.code !== 'tr') {
      assert.notEqual(
        serverMessages.getServerMessage(meta.code, 'invalidHostHeader'),
        serverMessages.getServerMessage('tr', 'invalidHostHeader'),
        `server.${meta.code} leaked Turkish error`,
      );
      assert.notEqual(
        serverMessages.getServerMessage(meta.code, 'startupErrorHeading'),
        serverMessages.getServerMessage('tr', 'startupErrorHeading'),
        `server.${meta.code} leaked Turkish startup error`,
      );
    }
  }
});
