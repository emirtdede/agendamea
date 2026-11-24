import type { UiDictionary } from '../i18n/translations';

export interface ChangelogEntry {
  version: string;
  date: string;
  highlightKeys: ReadonlyArray<keyof UiDictionary>;
}

/**
 * In-app release notes kept strictly in sync with root CHANGELOG.md and
 * localized across all 73 languages via UiDictionary keys.
 */
export const APP_CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '2026-11-22',
    highlightKeys: [
      'changelogV110Item1',
      'changelogV110Item2',
      'changelogV110Item3',
      'changelogV110Item4',
      'changelogV110Item5',
      'changelogV110Item6',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-22',
    highlightKeys: [
      'changelogV100Item1',
      'changelogV100Item2',
      'changelogV100Item3',
      'changelogV100Item4',
      'changelogV100Item5',
    ],
  },
];
