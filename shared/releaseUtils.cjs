'use strict';

/**
 * Shared release version comparison & GitHub Releases response normalizer.
 * Consumed by Electron main process (CJS) and local Express backend (ESM/CJS).
 */

function compareSemver(a, b) {
  const cleanA = String(a || '').trim().replace(/^v/i, '').split('-')[0];
  const cleanB = String(b || '').trim().replace(/^v/i, '').split('-')[0];
  const partsA = cleanA.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const partsB = cleanB.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(partsA.length, partsB.length, 3);
  for (let i = 0; i < len; i += 1) {
    const va = partsA[i] || 0;
    const vb = partsB[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function parseGitHubRelease(data, currentVersion, fallbackReleaseUrl, checkedAt, overrides = {}) {
  const apiLatestVersion =
    String(data?.tag_name || currentVersion).replace(/^v/i, '') || currentVersion;
  const nativeLatest = overrides.nativeLatestVersion || null;
  const latestVersion =
    nativeLatest && compareSemver(nativeLatest, apiLatestVersion) >= 0
      ? nativeLatest
      : apiLatestVersion;
  const updateAvailable = compareSemver(latestVersion, currentVersion) > 0;
  const assets = Array.isArray(data?.assets) ? data.assets : [];

  const setupAsset = assets.find(
    (a) => typeof a?.name === 'string' && /setup.*\.exe$/i.test(a.name),
  );
  const portableAsset = assets.find(
    (a) => typeof a?.name === 'string' && /portable.*\.exe$/i.test(a.name),
  );
  const msixAsset = assets.find(
    (a) => typeof a?.name === 'string' && /\.(msix|appx)$/i.test(a.name),
  );

  return {
    ok: true,
    currentVersion,
    latestVersion,
    updateAvailable,
    ...(overrides.nativeAutoUpdateReady !== undefined
      ? { nativeAutoUpdateReady: Boolean(overrides.nativeAutoUpdateReady) }
      : {}),
    ...(overrides.downloaded !== undefined ? { downloaded: Boolean(overrides.downloaded) } : {}),
    releaseName:
      typeof data?.name === 'string' && data.name ? data.name : `Agendamea v${latestVersion}`,
    releaseNotes: typeof data?.body === 'string' ? data.body.slice(0, 4000) : '',
    publishedAt: typeof data?.published_at === 'string' ? data.published_at : null,
    releaseUrl:
      typeof data?.html_url === 'string' && data.html_url ? data.html_url : fallbackReleaseUrl,
    setupUrl:
      typeof setupAsset?.browser_download_url === 'string'
        ? setupAsset.browser_download_url
        : null,
    portableUrl:
      typeof portableAsset?.browser_download_url === 'string'
        ? portableAsset.browser_download_url
        : null,
    msixUrl:
      typeof msixAsset?.browser_download_url === 'string'
        ? msixAsset.browser_download_url
        : null,
    checkedAt,
  };
}

module.exports = {
  compareSemver,
  parseGitHubRelease,
};
