import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'electron-resources');
fs.mkdirSync(OUT_DIR, { recursive: true });

/**
 * Agendamea architectural monogram paths (512x512 coordinate space, optically centered).
 */
function monogramPaths(strokeColor = '#ffffff', accentColor = '#ffffff') {
  return `
    <g transform="translate(-4 3)" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 144 378 L 252 128 L 294 224" stroke="${strokeColor}" stroke-width="40" />
      <path d="M 332 312 L 360 378" stroke="${strokeColor}" stroke-width="40" />
      <path d="M 202 288 L 252 336 L 376 198" stroke="${accentColor}" stroke-width="40" />
    </g>
  `;
}

/**
 * Encodes raw 3-channel RGB pixels into a strict Windows 24-bit uncompressed DIB BMP.
 * NSIS Modern UI 2 requires genuine 24-bit BMP files (BITMAPFILEHEADER + BITMAPINFOHEADER).
 */
function encodeBmp24(rgbBuffer, width, height) {
  const rowBytes = width * 3;
  const paddedRowBytes = (rowBytes + 3) & ~3;
  const pixelDataSize = paddedRowBytes * height;
  const fileSize = 54 + pixelDataSize;
  const out = Buffer.alloc(fileSize);

  // BITMAPFILEHEADER (14 bytes)
  out.write('BM', 0, 'ascii');
  out.writeUInt32LE(fileSize, 2);
  out.writeUInt32LE(0, 6);
  out.writeUInt32LE(54, 10);

  // BITMAPINFOHEADER (40 bytes)
  out.writeUInt32LE(40, 14); // biSize
  out.writeInt32LE(width, 18); // biWidth
  out.writeInt32LE(height, 22); // biHeight (positive = bottom-up DIB)
  out.writeUInt16LE(1, 26); // biPlanes
  out.writeUInt16LE(24, 28); // biBitCount (24-bit BGR)
  out.writeUInt32LE(0, 30); // biCompression = BI_RGB
  out.writeUInt32LE(pixelDataSize, 34); // biSizeImage
  out.writeInt32LE(3780, 38); // biXPelsPerMeter (~96 DPI)
  out.writeInt32LE(3780, 42); // biYPelsPerMeter (~96 DPI)
  out.writeUInt32LE(0, 46); // biClrUsed
  out.writeUInt32LE(0, 50); // biClrImportant

  // Pixel data: bottom-up rows, BGR byte order
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * rowBytes;
    const dstRow = 54 + y * paddedRowBytes;
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * 3;
      const d = dstRow + x * 3;
      out[d] = rgbBuffer[s + 2]; // B
      out[d + 1] = rgbBuffer[s + 1]; // G
      out[d + 2] = rgbBuffer[s]; // R
    }
  }

  return out;
}

/**
 * Multi-resolution Windows ICO encoder (PNG frames 16..256px).
 */
function encodeIco(frames) {
  const count = frames.length;
  const headerSize = 6 + count * 16;
  const header = Buffer.alloc(headerSize);

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  let offset = headerSize;
  for (let i = 0; i < count; i++) {
    const { size, buffer } = frames[i];
    const entryOffset = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset + 0);
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(buffer.length, entryOffset + 8);
    header.writeUInt32LE(offset, entryOffset + 12);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...frames.map((f) => f.buffer)]);
}

async function renderBmp24(svgString, width, height) {
  const { data } = await sharp(Buffer.from(svgString), { density: 288 })
    .resize(width, height, { kernel: sharp.kernel.lanczos3 })
    .flatten({ background: { r: 9, g: 9, b: 11 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return encodeBmp24(data, width, height);
}

async function renderIco(svgString) {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const frames = [];
  for (const size of sizes) {
    const buffer = await sharp(Buffer.from(svgString), { density: 288 })
      .resize(size, size, {
        fit: 'contain',
        kernel: sharp.kernel.lanczos3,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9, palette: false })
      .toBuffer();
    frames.push({ size, buffer });
  }
  return encodeIco(frames);
}

/** 1. Primary App Icon (Obsidian squircle + centered crisp Agendamea monogram) */
const appIconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="ag-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e1e24" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <linearGradient id="ag-edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.04" />
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#ag-bg)" />
  <rect x="20" y="20" width="472" height="472" rx="108" fill="none" stroke="url(#ag-edge)" stroke-width="4" />
  ${monogramPaths('#ffffff', '#ffffff')}
</svg>
`;

/** 2. Setup Wizard Icon (Clean centered Obsidian squircle + Agendamea monogram, no corner badge) */
const installerIconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="inst-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e1e24" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <linearGradient id="inst-edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.04" />
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#inst-bg)" />
  <rect x="20" y="20" width="472" height="472" rx="108" fill="none" stroke="url(#inst-edge)" stroke-width="4" />
  ${monogramPaths('#ffffff', '#ffffff')}
</svg>
`;

/** 3. Uninstaller Icon (Clean centered Obsidian squircle + Agendamea monogram, no corner badge) */
const uninstallerIconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="uninst-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e1e24" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <linearGradient id="uninst-edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.04" />
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#uninst-bg)" />
  <rect x="20" y="20" width="472" height="472" rx="108" fill="none" stroke="url(#uninst-edge)" stroke-width="4" />
  ${monogramPaths('#ffffff', '#ffffff')}
</svg>
`;

/**
 * 4. NSIS Welcome/Finish Sidebar (164 x 314)
 * Rendered at 2x design coordinate grid (328 x 628) then supersampled cleanly to 164 x 314.
 */
const installerSidebarSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 328 628" width="328" height="628">
  <defs>
    <linearGradient id="side-bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#17171c" />
      <stop offset="55%" stop-color="#0e0e12" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <radialGradient id="top-glow" cx="50%" cy="16%" r="55%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.10" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="accent-bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.7" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.08" />
    </linearGradient>
  </defs>

  <rect width="328" height="628" fill="url(#side-bg)" />
  <rect width="328" height="628" fill="url(#top-glow)" />

  <!-- Subtle architectural grid accents -->
  <line x1="0" y1="0" x2="328" y2="0" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2" />
  <line x1="327" y1="0" x2="327" y2="628" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2" />
  <circle cx="290" cy="72" r="96" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="2" />
  <circle cx="290" cy="72" r="144" fill="none" stroke="#ffffff" stroke-opacity="0.02" stroke-width="2" />

  <!-- Emblem Tile (Dark Obsidian Default) -->
  <g transform="translate(36 56)">
    <rect x="0" y="0" width="96" height="96" rx="24" fill="#18181b" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2" />
    <g transform="translate(6 6) scale(0.164)">
      ${monogramPaths('#fafafa', '#fafafa')}
    </g>
  </g>

  <!-- Brand Lockup -->
  <text x="36" y="198" fill="#fafafa" font-family="'Segoe UI', system-ui, sans-serif" font-size="38" font-weight="700" letter-spacing="-1">Agendamea</text>
  <text x="36" y="226" fill="#a1a1aa" font-family="'Segoe UI', system-ui, sans-serif" font-size="17" font-weight="400">Minimalist Görev Yöneticisi</text>

  <!-- Hairline divider -->
  <rect x="36" y="254" width="120" height="2" rx="1" fill="url(#accent-bar)" />

  <!-- Key Highlights -->
  <g font-family="'Segoe UI', system-ui, sans-serif" font-size="16" fill="#d4d4d8">
    <circle cx="44" cy="300" r="4" fill="#10b981" />
    <text x="60" y="306">Verileriniz cihazınızda saklanır</text>

    <circle cx="44" cy="340" r="4" fill="#10b981" />
    <text x="60" y="346">Anlık otomatik kayıt</text>

    <circle cx="44" cy="380" r="4" fill="#10b981" />
    <text x="60" y="386">14 özel tema ve koyu mod</text>

    <circle cx="44" cy="420" r="4" fill="#10b981" />
    <text x="60" y="426">Tamamen çevrimdışı</text>
  </g>

  <!-- Bottom Publisher Footer -->
  <line x1="36" y1="534" x2="292" y2="534" stroke="#ffffff" stroke-opacity="0.09" stroke-width="1.5" />
  <text x="36" y="566" fill="#fafafa" font-family="'Segoe UI', system-ui, sans-serif" font-size="16" font-weight="700" letter-spacing="2.4">VELLIUM</text>
  <text x="36" y="592" fill="#71717a" font-family="'Segoe UI', system-ui, sans-serif" font-size="14" font-weight="400">vellium.dev</text>
</svg>
`;

/**
 * 5. NSIS Uninstaller Sidebar (164 x 314)
 */
const uninstallerSidebarSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 328 628" width="328" height="628">
  <defs>
    <linearGradient id="unside-bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#1c1619" />
      <stop offset="55%" stop-color="#110f12" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <radialGradient id="untop-glow" cx="50%" cy="16%" r="55%">
      <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.14" />
      <stop offset="100%" stop-color="#f43f5e" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="unaccent-bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.75" />
      <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.08" />
    </linearGradient>
  </defs>

  <rect width="328" height="628" fill="url(#unside-bg)" />
  <rect width="328" height="628" fill="url(#untop-glow)" />

  <line x1="327" y1="0" x2="327" y2="628" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2" />

  <!-- Emblem Tile (muted refined treatment) -->
  <g transform="translate(36 56)">
    <rect x="0" y="0" width="96" height="96" rx="24" fill="#27272a" stroke="#ffffff" stroke-opacity="0.16" stroke-width="2" />
    <g transform="translate(6 6) scale(0.164)">
      ${monogramPaths('#fafafa', '#fafafa')}
    </g>
  </g>

  <text x="36" y="198" fill="#fafafa" font-family="'Segoe UI', system-ui, sans-serif" font-size="38" font-weight="700" letter-spacing="-1">Agendamea</text>
  <text x="36" y="226" fill="#fda4af" font-family="'Segoe UI', system-ui, sans-serif" font-size="17" font-weight="500">Kaldırma Yardımcısı</text>

  <rect x="36" y="254" width="120" height="2" rx="1" fill="url(#unaccent-bar)" />

  <g font-family="'Segoe UI', system-ui, sans-serif" font-size="15.5" fill="#a1a1aa">
    <text x="36" y="302">Uygulama dosyaları sistemden</text>
    <text x="36" y="326">temiz şekilde kaldırılır.</text>
    <text x="36" y="370" fill="#d4d4d8">İsterseniz yerel görev</text>
    <text x="36" y="394" fill="#d4d4d8">verilerinizi koruyabilirsiniz.</text>
  </g>

  <line x1="36" y1="534" x2="292" y2="534" stroke="#ffffff" stroke-opacity="0.09" stroke-width="1.5" />
  <text x="36" y="566" fill="#fafafa" font-family="'Segoe UI', system-ui, sans-serif" font-size="16" font-weight="700" letter-spacing="2.4">VELLIUM</text>
  <text x="36" y="592" fill="#71717a" font-family="'Segoe UI', system-ui, sans-serif" font-size="14" font-weight="400">support@vellium.dev</text>
</svg>
`;

/**
 * 6. NSIS Inner Pages Header Banner (150 x 57)
 * Crisp light header banner (matches Windows 11 MUI2 white header bar seamlessly).
 */
const installerHeaderSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 114" width="300" height="114">
  <rect width="300" height="114" fill="#ffffff" />
  <g transform="translate(22 25)">
    <rect x="0" y="0" width="64" height="64" rx="16" fill="#09090b" />
    <g transform="translate(4 4) scale(0.109375)">
      ${monogramPaths('#ffffff', '#ffffff')}
    </g>
  </g>
  <text x="104" y="67" fill="#09090b" font-family="'Segoe UI', system-ui, sans-serif" font-size="30" font-weight="700" letter-spacing="-0.6">Agendamea</text>
</svg>
`;

async function main() {
  // Multi-resolution Windows ICOs
  fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), await renderIco(appIconSvg));
  fs.writeFileSync(path.join(OUT_DIR, 'installer.ico'), await renderIco(installerIconSvg));
  fs.writeFileSync(path.join(OUT_DIR, 'uninstaller.ico'), await renderIco(uninstallerIconSvg));

  // Strict 24-bit Windows BMP banners for NSIS Modern UI 2
  fs.writeFileSync(
    path.join(OUT_DIR, 'installerSidebar.bmp'),
    await renderBmp24(installerSidebarSvg, 164, 314),
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'uninstallerSidebar.bmp'),
    await renderBmp24(uninstallerSidebarSvg, 164, 314),
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'installerHeader.bmp'),
    await renderBmp24(installerHeaderSvg, 150, 57),
  );

  console.log(
    'Generated Windows 11 NSIS installer/uninstaller BMPs and ICOs in electron-resources/.',
  );
}

main().catch((err) => {
  console.error('Installer asset generation failed:', err);
  process.exit(1);
});
