'use strict';

let version = '1.1.0';
try {
  const pkg = require('../package.json');
  if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
    version = pkg.version.trim();
  }
} catch {
  // Fallback when bundled without adjacent package.json
}

module.exports = { APP_VERSION: version };
