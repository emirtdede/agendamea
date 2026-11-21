'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFile } = require('node:child_process');

const APP_USER_MODEL_ID = 'dev.vellium.agendamea';
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

// Precomputed CRC32 table for standard PNG chunks
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodeRgbaToPng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter None
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function parseHexColor(hex, fallback = [24, 24, 27]) {
  if (typeof hex !== 'string') return fallback;
  const clean = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return fallback;
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

// Signed distance to a rounded rectangle centered at (cx, cy) with half-extents (hx, hy) and corner radius r
function sdRoundedBox(px, py, cx, cy, hx, hy, r) {
  const dx = Math.abs(px - cx) - (hx - r);
  const dy = Math.abs(py - cy) - (hy - r);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
}

// Distance from point (px, py) to line segment (ax, ay)-(bx, by)
function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 0) return Math.hypot(wx, wy);
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

// Agendamea vector glyph segments in normalized [0..512] BrandMark coordinates (mapped into 76% inner box)
const MARK_SCALE = 0.78;
const MARK_OFFSET = (512 * (1 - MARK_SCALE)) / 2;
function mapPt(x, y) {
  return [(x - 4) * MARK_SCALE + MARK_OFFSET, (y + 3) * MARK_SCALE + MARK_OFFSET];
}

const STROKE_SEGMENTS = [
  [...mapPt(144, 378), ...mapPt(252, 128)],
  [...mapPt(252, 128), ...mapPt(294, 224)],
  [...mapPt(332, 312), ...mapPt(360, 378)],
  [...mapPt(202, 288), ...mapPt(252, 336)],
  [...mapPt(252, 336), ...mapPt(376, 198)],
];
const STROKE_HALF_WIDTH = (44 * MARK_SCALE) / 2;

/**
 * Renders the Agendamea icon at any square pixel size using 4x4 supersampled SDF rasterization.
 */
function renderAgendameaPng(size, bgHex, fgHex) {
  const [bgR, bgG, bgB] = parseHexColor(bgHex, [24, 24, 27]);
  const [fgR, fgG, fgB] = parseHexColor(fgHex, [255, 255, 255]);
  const isLightBg = 0.2126 * bgR + 0.7152 * bgG + 0.0722 * bgB > 170;
  const borderR = isLightBg ? 200 : 255;
  const borderG = isLightBg ? 202 : 255;
  const borderB = isLightBg ? 208 : 255;
  const borderAlpha = isLightBg ? 0.55 : 0.14;

  const rgba = Buffer.alloc(size * size * 4);
  const subSamples = size <= 48 ? 4 : 3;
  const invSub = 1 / subSamples;
  const invTotal = 1 / (subSamples * subSamples);
  const scaleTo512 = 512 / size;
  const halfExtent = 244; // subtle 12px margin inside 512 canvas so corners never clip
  const cornerRadius = 108;
  const strokeHalf = size <= 24 ? STROKE_HALF_WIDTH * 1.18 : STROKE_HALF_WIDTH;
  const borderWidth = size <= 32 ? 18 : 10;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let accR = 0;
      let accG = 0;
      let accB = 0;
      let accA = 0;

      for (let sy = 0; sy < subSamples; sy += 1) {
        const py = (y + (sy + 0.5) * invSub) * scaleTo512;
        for (let sx = 0; sx < subSamples; sx += 1) {
          const px = (x + (sx + 0.5) * invSub) * scaleTo512;
          const dBox = sdRoundedBox(px, py, 256, 256, halfExtent, halfExtent, cornerRadius);
          if (dBox > 0) continue;

          // Inside rounded tile
          let sr = bgR;
          let sg = bgG;
          let sb = bgB;

          // Subtle crisp inner hairline border
          if (dBox > -borderWidth) {
            sr = sr * (1 - borderAlpha) + borderR * borderAlpha;
            sg = sg * (1 - borderAlpha) + borderG * borderAlpha;
            sb = sb * (1 - borderAlpha) + borderB * borderAlpha;
          }

          // Check stroke segments
          let minSeg = Infinity;
          for (let i = 0; i < STROKE_SEGMENTS.length; i += 1) {
            const seg = STROKE_SEGMENTS[i];
            const d = distToSegment(px, py, seg[0], seg[1], seg[2], seg[3]);
            if (d < minSeg) minSeg = d;
          }
          if (minSeg <= strokeHalf) {
            sr = fgR;
            sg = fgG;
            sb = fgB;
          }

          accR += sr;
          accG += sg;
          accB += sb;
          accA += 1;
        }
      }

      const idx = (y * size + x) * 4;
      if (accA > 0) {
        rgba[idx] = Math.round(accR / accA);
        rgba[idx + 1] = Math.round(accG / accA);
        rgba[idx + 2] = Math.round(accB / accA);
        rgba[idx + 3] = Math.round(accA * invTotal * 255);
      }
    }
  }

  return encodeRgbaToPng(size, size, rgba);
}

/**
 * Packs multiple PNG frames into a standard multi-resolution Windows .ico buffer.
 */
function buildMultiSizeIcoBuffer(bgHex, fgHex) {
  const frames = ICO_SIZES.map((size) => ({
    size,
    png: renderAgendameaPng(size, bgHex, fgHex),
  }));

  const headerSize = 6 + frames.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type = ICO
  header.writeUInt16LE(frames.length, 4);

  let offset = headerSize;
  frames.forEach((frame, idx) => {
    const entryOffset = 6 + idx * 16;
    header[entryOffset] = frame.size >= 256 ? 0 : frame.size;
    header[entryOffset + 1] = frame.size >= 256 ? 0 : frame.size;
    header[entryOffset + 2] = 0; // Color palette
    header[entryOffset + 3] = 0; // Reserved
    header.writeUInt16LE(1, entryOffset + 4); // Color planes
    header.writeUInt16LE(32, entryOffset + 6); // Bits per pixel
    header.writeUInt32LE(frame.png.length, entryOffset + 8);
    header.writeUInt32LE(offset, entryOffset + 12);
    offset += frame.png.length;
  });

  return {
    icoBuffer: Buffer.concat([header, ...frames.map((f) => f.png)]),
    trayPngBuffer: frames.find((f) => f.size === 32).png,
    windowPngBuffer: frames.find((f) => f.size === 64).png,
  };
}

function ensureDynamicIconFiles(userDataDir, bgHex, fgHex) {
  const normBg = typeof bgHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(bgHex.trim())
    ? bgHex.trim().toLowerCase()
    : '#18181b';
  const normFg = typeof fgHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(fgHex.trim())
    ? fgHex.trim().toLowerCase()
    : '#ffffff';

  const hash = crypto
    .createHash('sha1')
    .update(`${normBg}:${normFg}:v1`)
    .digest('hex')
    .slice(0, 12);

  const iconsDir = path.join(userDataDir, 'icons');
  fs.mkdirSync(iconsDir, { recursive: true });

  const icoPath = path.join(iconsDir, `agendamea-${hash}.ico`);
  const trayPngPath = path.join(iconsDir, `agendamea-${hash}-32.png`);

  if (!fs.existsSync(icoPath) || !fs.existsSync(trayPngPath)) {
    const { icoBuffer, trayPngBuffer } = buildMultiSizeIcoBuffer(normBg, normFg);
    const tmpIco = `${icoPath}.tmp`;
    const tmpPng = `${trayPngPath}.tmp`;
    fs.writeFileSync(tmpIco, icoBuffer);
    fs.renameSync(tmpIco, icoPath);
    fs.writeFileSync(tmpPng, trayPngBuffer);
    fs.renameSync(tmpPng, trayPngPath);
  }

  // Persist active icon metadata so startup restores the exact icon synchronously before window creation
  const metaPath = path.join(userDataDir, 'active-icon.json');
  try {
    fs.writeFileSync(
      metaPath,
      JSON.stringify({ bg: normBg, fg: normFg, icoPath, trayPngPath }, null, 2),
      'utf8',
    );
  } catch {
    // Ignore metadata write failure
  }

  // Clean up old stale dynamic icons (keep active hash files only)
  try {
    const keep = new Set([path.basename(icoPath), path.basename(trayPngPath)]);
    for (const file of fs.readdirSync(iconsDir)) {
      if (file.startsWith('agendamea-') && !keep.has(file)) {
        try {
          fs.rmSync(path.join(iconsDir, file), { force: true });
        } catch {
          // Ignore locked icon file
        }
      }
    }
  } catch {
    // Ignore cleanup errors
  }

  return { bg: normBg, fg: normFg, icoPath, trayPngPath };
}

function readSavedActiveIcon(userDataDir) {
  try {
    const metaPath = path.join(userDataDir, 'active-icon.json');
    if (!fs.existsSync(metaPath)) return null;
    const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (data && typeof data.icoPath === 'string' && fs.existsSync(data.icoPath)) {
      return data;
    }
  } catch {
    // Ignore unreadable cache
  }
  return null;
}

function collectLnkFiles(dirs, maxDepth = 2) {
  const results = [];
  const visited = new Set();
  const walk = (dir, depth) => {
    if (!dir || depth > maxDepth) return;
    const norm = path.resolve(dir).toLowerCase();
    if (visited.has(norm)) return;
    visited.add(norm);
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lnk')) {
        results.push(full);
      }
    }
  };
  for (const d of dirs) walk(d, 0);
  return results;
}

function looksLikeAgendameaShortcut(lnkPath, details) {
  const base = path.basename(lnkPath).toLowerCase();
  if (base.includes('agendamea')) return true;
  if (
    details &&
    typeof details.appUserModelId === 'string' &&
    details.appUserModelId.toLowerCase() === APP_USER_MODEL_ID
  ) {
    return true;
  }
  if (
    details &&
    typeof details.target === 'string' &&
    path.basename(details.target).toLowerCase().includes('agendamea')
  ) {
    return true;
  }
  return false;
}

function getWindowsShortcutDirs(app) {
  const desktopDirs = [];
  const startMenuDirs = [];
  const taskbarDirs = [];
  const pushUnique = (arr, dir) => {
    if (typeof dir === 'string' && dir.trim() && fs.existsSync(dir)) {
      const resolved = path.resolve(dir);
      if (!arr.some((x) => x.toLowerCase() === resolved.toLowerCase())) {
        arr.push(resolved);
      }
    }
  };

  try {
    pushUnique(desktopDirs, app.getPath('desktop'));
  } catch {
    // Ignore
  }
  if (process.env.USERPROFILE) {
    pushUnique(desktopDirs, path.join(process.env.USERPROFILE, 'Desktop'));
  }
  for (const od of [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial]) {
    if (od) pushUnique(desktopDirs, path.join(od, 'Desktop'));
  }
  if (process.env.PUBLIC) {
    pushUnique(desktopDirs, path.join(process.env.PUBLIC, 'Desktop'));
  }
  if (process.env.APPDATA) {
    pushUnique(startMenuDirs, path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
    const pinned = path.join(
      process.env.APPDATA,
      'Microsoft',
      'Internet Explorer',
      'Quick Launch',
      'User Pinned',
    );
    pushUnique(taskbarDirs, path.join(pinned, 'TaskBar'));
    pushUnique(taskbarDirs, path.join(pinned, 'ImplicitAppShortcuts'));
  }
  if (process.env.ProgramData) {
    pushUnique(startMenuDirs, path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  }

  return { desktopDirs, startMenuDirs, taskbarDirs };
}

function notifyWindowsShellIconRefresh() {
  if (process.platform !== 'win32') return;
  try {
    const psScript =
      "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class ShNotify { [DllImport(\"shell32.dll\")] public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2); }'; [ShNotify]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)";
    const child = execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript],
      { windowsHide: true, timeout: 4000 },
      () => {},
    );
    child.unref();
  } catch {
    // Best-effort Explorer shell refresh
  }
}

function updateWindowsShortcuts(icoPath, { shell, app, isStoreBuild = false }) {
  if (
    process.platform !== 'win32' ||
    !icoPath ||
    !shell ||
    typeof shell.readShortcutLink !== 'function' ||
    typeof shell.writeShortcutLink !== 'function'
  ) {
    return { updated: [], skipped: true };
  }

  const { desktopDirs, startMenuDirs, taskbarDirs } = getWindowsShortcutDirs(app);
  const dirs = isStoreBuild
    ? [...desktopDirs, ...taskbarDirs]
    : [...desktopDirs, ...startMenuDirs, ...taskbarDirs];
  const candidates = collectLnkFiles(dirs, 2);
  const updated = [];

  for (const lnkPath of candidates) {
    let existing;
    try {
      existing = shell.readShortcutLink(lnkPath);
    } catch {
      continue;
    }
    if (!looksLikeAgendameaShortcut(lnkPath, existing)) continue;
    try {
      const details = {
        target: existing.target,
        cwd: existing.cwd || (existing.target ? path.dirname(existing.target) : undefined),
        args: existing.args || undefined,
        description: existing.description || undefined,
        icon: icoPath,
        iconIndex: 0,
        appUserModelId: existing.appUserModelId || APP_USER_MODEL_ID,
      };
      let ok = shell.writeShortcutLink(lnkPath, 'update', details);
      if (ok) {
        try {
          const verify = shell.readShortcutLink(lnkPath);
          if (
            verify &&
            typeof verify.icon === 'string' &&
            verify.icon.length > 0 &&
            verify.icon.toLowerCase() !== icoPath.toLowerCase()
          ) {
            ok = shell.writeShortcutLink(lnkPath, 'replace', details);
          }
        } catch {
          // Ignore verify failure
        }
      } else {
        ok = shell.writeShortcutLink(lnkPath, 'replace', details);
      }
      if (ok) {
        try {
          const now = new Date();
          fs.utimesSync(lnkPath, now, now);
        } catch {
          // Best-effort timestamp touch
        }
        updated.push(lnkPath);
      }
    } catch {
      // Ignore inaccessible shortcut
    }
  }

  if (updated.length > 0) {
    notifyWindowsShellIconRefresh();
  }
  return { updated, skipped: false };
}

module.exports = {
  APP_USER_MODEL_ID,
  renderAgendameaPng,
  buildMultiSizeIcoBuffer,
  ensureDynamicIconFiles,
  readSavedActiveIcon,
  updateWindowsShortcuts,
};
