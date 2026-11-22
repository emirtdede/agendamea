import type { UpdateCheckResult } from '../src/types';

export interface ParseReleaseOverrides {
  nativeLatestVersion?: string | null;
  nativeAutoUpdateReady?: boolean;
  downloaded?: boolean;
}

export function compareSemver(a: string, b: string): number;

export function parseGitHubRelease(
  data: Record<string, unknown> | null | undefined,
  currentVersion: string,
  fallbackReleaseUrl: string,
  checkedAt: string,
  overrides?: ParseReleaseOverrides,
): UpdateCheckResult;

declare const releaseUtils: {
  compareSemver: typeof compareSemver;
  parseGitHubRelease: typeof parseGitHubRelease;
};

export default releaseUtils;
