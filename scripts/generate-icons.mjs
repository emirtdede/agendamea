import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const ICONS_DIR = path.join(PUBLIC_DIR, 'icons');
const WINDOWS_DIR = path.join(ICONS_DIR, 'windows');
const APPX_DIR = path.join(ROOT, 'electron-resources', 'appx');
const LOGOS_DIR = path.join(PUBLIC_DIR, 'logos');

for (const dir of [PUBLIC_DIR, ICONS_DIR, WINDOWS_DIR, APPX_DIR, LOGOS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeStoreAsset(fileName, buffer) {
  fs.writeFileSync(path.join(WINDOWS_DIR, fileName), buffer);
  fs.writeFileSync(path.join(APPX_DIR, fileName), buffer);
}

/**
 * Master Agendamea monogram paths inside a 512x512 coordinate space (optically centered).
 * Combines a geometric architectural "A" with an integrated precision checkmark.
 */
function monogramPaths(strokeColor = '#ffffff', accentColor = '#ffffff') {
  return `
    <g transform="translate(-4 3)" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <!-- Left leg + Apex + Upper right shoulder of A -->
      <path d="M 144 378 L 252 128 L 294 224" stroke="${strokeColor}" stroke-width="40" />
      <!-- Lower right foot of A -->
      <path d="M 332 312 L 360 378" stroke="${strokeColor}" stroke-width="40" />
      <!-- Integrated Checkmark Crossbar -->
      <path d="M 202 288 L 252 336 L 376 198" stroke="${accentColor}" stroke-width="40" />
    </g>
  `;
}

/** Standard rounded squircle app icon (transparent outer corners, crisp dark tile) */
const masterIconSvg = `<?xml version="1.0" encoding="UTF-8"?>
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

/** Full-bleed maskable / tile icon (15% safe zone padding on all sides for Android & Windows tiles) */
const maskableIconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="ag-mask-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e1e24" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" fill="url(#ag-mask-bg)" />
  <g transform="translate(256 256) scale(0.72) translate(-256 -256)">
    ${monogramPaths('#ffffff', '#ffffff')}
  </g>
</svg>
`;

/** Monochrome Safari pinned tab & Windows monochrome badge SVG */
const monochromeSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g transform="translate(-3 5)" fill="none" stroke="#000000" stroke-width="44" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 116 404 L 248 98 L 300 216" />
    <path d="M 346 322 L 380 404" />
    <path d="M 186 294 L 248 354 L 402 184" />
  </g>
</svg>
`;

/** Microsoft Store AppX LockScreen BadgeLogo (monochrome white on transparent) */
const badgeLogoSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g transform="translate(-3 5)" fill="none" stroke="#ffffff" stroke-width="48" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 116 404 L 248 98 L 300 216" />
    <path d="M 346 322 L 380 404" />
    <path d="M 186 294 L 248 354 L 402 184" />
  </g>
</svg>
`;

/** Standalone light & dark marks for UI / docs */
const markLightSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect x="16" y="16" width="480" height="480" rx="112" fill="#09090b" />
  ${monogramPaths('#ffffff', '#ffffff')}
</svg>
`;

const markDarkSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect x="16" y="16" width="480" height="480" rx="112" fill="#111114" stroke="#ffffff" stroke-opacity="0.18" stroke-width="6" />
  ${monogramPaths('#fafafa', '#fafafa')}
</svg>
`;

/** Horizontal brand lockups (Light & Dark themes - default dark obsidian emblem) */
function horizontalLogoSvg(mode) {
  const isDark = mode === 'dark';
  const tileFill = isDark ? '#111114' : '#09090b';
  const tileStroke = isDark ? ' stroke="#ffffff" stroke-opacity="0.18" stroke-width="8"' : '';
  const glyphStroke = '#ffffff';
  const textFill = isDark ? '#fafafa' : '#09090b';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 160" width="640" height="160">
  <g transform="translate(20 20) scale(0.234375)">
    <rect x="16" y="16" width="480" height="480" rx="112" fill="${tileFill}"${tileStroke} />
    ${monogramPaths(glyphStroke, glyphStroke)}
  </g>
  <text
    x="168"
    y="102"
    fill="${textFill}"
    font-family="'Plus Jakarta Sans', 'Segoe UI', system-ui, -apple-system, sans-serif"
    font-size="68"
    font-weight="700"
    letter-spacing="-2"
  >Agendamea</text>
</svg>
`;
}

/** Wide Windows Tile & Splash Screen SVG generator */
function wideTileSvg(width, height, withWordmark = true) {
  const iconSize = Math.round(height * 0.44);
  const iconScale = iconSize / 512;
  if (!withWordmark) {
    const x = Math.round((width - iconSize) / 2);
    const y = Math.round((height - iconSize) / 2);
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="w-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#18181b" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#w-bg)" />
  <g transform="translate(${x} ${y}) scale(${iconScale})">
    ${monogramPaths('#ffffff', '#ffffff')}
  </g>
</svg>
`;
  }

  const fontSize = Math.round(height * 0.185);
  const gap = Math.round(height * 0.085);
  const approxTextWidth = Math.round(fontSize * 5.65);
  const totalContentWidth = iconSize + gap + approxTextWidth;
  const startX = Math.max(Math.round(width * 0.07), Math.round((width - totalContentWidth) / 2));
  const iconY = Math.round((height - iconSize) / 2);
  const textX = startX + iconSize + gap;
  const textY = Math.round(height / 2 + fontSize * 0.34);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="w-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#18181b" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#w-bg)" />
  <g transform="translate(${startX} ${iconY}) scale(${iconScale})">
    <rect x="16" y="16" width="480" height="480" rx="112" fill="#27272a" stroke="#ffffff" stroke-opacity="0.14" stroke-width="6" />
    ${monogramPaths('#ffffff', '#ffffff')}
  </g>
  <text
    x="${textX}"
    y="${textY}"
    fill="#fafafa"
    font-family="'Segoe UI', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"
    font-size="${fontSize}"
    font-weight="700"
    letter-spacing="${(-fontSize * 0.025).toFixed(1)}"
  >Agendamea</text>
</svg>
`;
}

/** OpenGraph / Social Share Card (1200x630) */
const ogImageSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="og-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#141418" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#og-bg)" />
  <rect x="44" y="44" width="1112" height="542" rx="32" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2" />
  <g transform="translate(116 205) scale(0.42)">
    <rect x="16" y="16" width="480" height="480" rx="112" fill="#18181b" stroke="#ffffff" stroke-opacity="0.18" stroke-width="8" />
    ${monogramPaths('#fafafa', '#fafafa')}
  </g>
  <text
    x="376"
    y="302"
    fill="#fafafa"
    font-family="'Segoe UI', 'Plus Jakarta Sans', system-ui, sans-serif"
    font-size="86"
    font-weight="700"
    letter-spacing="-2.5"
  >Agendamea</text>
  <text
    x="380"
    y="366"
    fill="#a1a1aa"
    font-family="'Segoe UI', 'DM Sans', system-ui, sans-serif"
    font-size="27"
    font-weight="400"
  >Hızlı, modern ve anında kaydeden görev yöneticisi</text>
</svg>
`;

/**
 * Encodes multiple PNG buffers into a single valid Windows multi-resolution .ico file.
 * Supports modern Windows Vista/7/10/11 PNG-compressed ICO frames up to 256x256.
 */
function encodeIco(frames) {
  const count = frames.length;
  const headerSize = 6 + count * 16;
  const header = Buffer.alloc(headerSize);

  // ICONDIR
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(count, 4);

  let offset = headerSize;
  for (let i = 0; i < count; i++) {
    const { size, buffer } = frames[i];
    const entryOffset = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset + 0); // Width (0 means 256)
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1); // Height (0 means 256)
    header.writeUInt8(0, entryOffset + 2); // Color palette
    header.writeUInt8(0, entryOffset + 3); // Reserved
    header.writeUInt16LE(1, entryOffset + 4); // Color planes
    header.writeUInt16LE(32, entryOffset + 6); // Bits per pixel
    header.writeUInt32LE(buffer.length, entryOffset + 8); // Image size
    header.writeUInt32LE(offset, entryOffset + 12); // Image offset
    offset += buffer.length;
  }

  return Buffer.concat([header, ...frames.map((f) => f.buffer)]);
}

async function renderPng(svgString, width, height = width, nativeWidth = 512) {
  // 2x supersampling relative to the SVG's own coordinate width, capped safely
  const targetScale = Math.max(width / nativeWidth, 1);
  const density = Math.min(288, Math.max(72, Math.ceil(targetScale * 144)));
  return sharp(Buffer.from(svgString), { density })
    .resize(width, height, {
      fit: 'contain',
      kernel: sharp.kernel.lanczos3,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function main() {
  // 1. Write vector SVG brand assets
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon.svg'), masterIconSvg, 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-maskable.svg'), maskableIconSvg, 'utf8');
  fs.writeFileSync(path.join(ICONS_DIR, 'safari-pinned-tab.svg'), monochromeSvg, 'utf8');
  fs.writeFileSync(path.join(LOGOS_DIR, 'agendamea-mark-light.svg'), markLightSvg, 'utf8');
  fs.writeFileSync(path.join(LOGOS_DIR, 'agendamea-mark-dark.svg'), markDarkSvg, 'utf8');
  fs.writeFileSync(
    path.join(LOGOS_DIR, 'agendamea-logo-light.svg'),
    horizontalLogoSvg('light'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(LOGOS_DIR, 'agendamea-logo-dark.svg'),
    horizontalLogoSvg('dark'),
    'utf8',
  );

  // High-res PNG logos
  fs.writeFileSync(
    path.join(LOGOS_DIR, 'agendamea-logo-light.png'),
    await sharp(Buffer.from(horizontalLogoSvg('light')), { density: 288 })
      .resize(1280, 320)
      .png({ compressionLevel: 9 })
      .toBuffer(),
  );
  fs.writeFileSync(
    path.join(LOGOS_DIR, 'agendamea-logo-dark.png'),
    await sharp(Buffer.from(horizontalLogoSvg('dark')), { density: 288 })
      .resize(1280, 320)
      .png({ compressionLevel: 9 })
      .toBuffer(),
  );

  // 2. Multi-resolution Windows ICO (16, 24, 32, 48, 64, 128, 256)
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoFrames = [];
  for (const size of icoSizes) {
    const buffer = await renderPng(masterIconSvg, size);
    icoFrames.push({ size, buffer });
  }
  const icoBuffer = encodeIco(icoFrames);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), icoBuffer);
  fs.writeFileSync(path.join(ICONS_DIR, 'agendamea.ico'), icoBuffer);

  // 3. Standard Favicon & Web Icon PNGs
  for (const size of [16, 32, 48, 64, 96, 128, 256, 512, 1024]) {
    const png = await renderPng(masterIconSvg, size);
    if (size <= 256) {
      fs.writeFileSync(path.join(ICONS_DIR, `favicon-${size}x${size}.png`), png);
    } else {
      fs.writeFileSync(path.join(ICONS_DIR, `icon-${size}x${size}.png`), png);
    }
  }

  // 4. PWA Standard + Maskable + Apple Touch + WebP
  fs.writeFileSync(path.join(PUBLIC_DIR, 'pwa-192x192.png'), await renderPng(masterIconSvg, 192));
  fs.writeFileSync(path.join(PUBLIC_DIR, 'pwa-512x512.png'), await renderPng(masterIconSvg, 512));
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'pwa-maskable-192x192.png'),
    await renderPng(maskableIconSvg, 192),
  );
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'pwa-maskable-512x512.png'),
    await renderPng(maskableIconSvg, 512),
  );
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'apple-touch-icon.png'),
    await renderPng(maskableIconSvg, 180),
  );
  fs.writeFileSync(
    path.join(ICONS_DIR, 'apple-touch-icon-152x152.png'),
    await renderPng(maskableIconSvg, 152),
  );
  fs.writeFileSync(
    path.join(ICONS_DIR, 'apple-touch-icon-167x167.png'),
    await renderPng(maskableIconSvg, 167),
  );

  await sharp(Buffer.from(masterIconSvg), { density: 300 })
    .resize(512, 512)
    .webp({ lossless: true })
    .toFile(path.join(ICONS_DIR, 'icon-512x512.webp'));

  // 5. Microsoft browserconfig.xml Tiles
  for (const size of [70, 144, 150, 310]) {
    fs.writeFileSync(
      path.join(ICONS_DIR, `mstile-${size}x${size}.png`),
      await renderPng(maskableIconSvg, size),
    );
  }
  fs.writeFileSync(
    path.join(ICONS_DIR, 'mstile-310x150.png'),
    await renderPng(wideTileSvg(310, 150, true), 310, 150, 310),
  );

  // 6. Complete Windows 10/11 & Microsoft Store (MSIX / UWP / PWABuilder) Asset Pack
  const windowsSquarePacks = [
    [
      'SmallTile',
      [
        ['scale-100', 71],
        ['scale-125', 89],
        ['scale-150', 107],
        ['scale-200', 142],
        ['scale-400', 284],
      ],
    ],
    [
      'Square150x150Logo',
      [
        ['scale-100', 150],
        ['scale-125', 188],
        ['scale-150', 225],
        ['scale-200', 300],
        ['scale-400', 600],
      ],
    ],
    [
      'LargeTile',
      [
        ['scale-100', 310],
        ['scale-125', 388],
        ['scale-150', 465],
        ['scale-200', 620],
        ['scale-400', 1240],
      ],
    ],
    [
      'Square44x44Logo',
      [
        ['scale-100', 44],
        ['scale-125', 55],
        ['scale-150', 66],
        ['scale-200', 88],
        ['scale-400', 176],
      ],
    ],
    [
      'StoreLogo',
      [
        ['scale-100', 50],
        ['scale-125', 63],
        ['scale-150', 75],
        ['scale-200', 100],
        ['scale-400', 200],
      ],
    ],
    [
      'BadgeLogo',
      [
        ['scale-100', 24],
        ['scale-125', 30],
        ['scale-150', 36],
        ['scale-200', 48],
        ['scale-400', 96],
      ],
    ],
  ];

  for (const [prefix, scales] of windowsSquarePacks) {
    const svg =
      prefix === 'BadgeLogo'
        ? badgeLogoSvg
        : prefix === 'Square44x44Logo'
          ? masterIconSvg
          : maskableIconSvg;
    for (const [scaleName, size] of scales) {
      const buf = await renderPng(svg, size);
      writeStoreAsset(`${prefix}.${scaleName}.png`, buf);
      if (scaleName === 'scale-100') {
        // Unqualified base asset prevents electron-builder AppxTarget from falling back to SampleAppx Electron icons
        writeStoreAsset(`${prefix}.png`, buf);
      }
    }
  }

  // Windows Taskbar / AppList targetsize icons (unplated crisp icons)
  for (const targetSize of [16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256]) {
    const buf = await renderPng(masterIconSvg, targetSize);
    writeStoreAsset(`Square44x44Logo.targetsize-${targetSize}.png`, buf);
    writeStoreAsset(`Square44x44Logo.altform-unplated_targetsize-${targetSize}.png`, buf);
  }

  // Windows Wide310x150Logo & SplashScreen
  const windowsWidePacks = [
    [
      'Wide310x150Logo',
      [
        ['scale-100', 310, 150],
        ['scale-125', 388, 188],
        ['scale-150', 465, 225],
        ['scale-200', 620, 300],
        ['scale-400', 1240, 600],
      ],
    ],
    [
      'SplashScreen',
      [
        ['scale-100', 620, 300],
        ['scale-125', 775, 375],
        ['scale-150', 930, 450],
        ['scale-200', 1240, 600],
        ['scale-400', 2480, 1200],
      ],
    ],
  ];

  for (const [prefix, dims] of windowsWidePacks) {
    for (const [scaleName, w, h] of dims) {
      const buf = await renderPng(wideTileSvg(w, h, true), w, h, w);
      writeStoreAsset(`${prefix}.${scaleName}.png`, buf);
      if (scaleName === 'scale-100') {
        writeStoreAsset(`${prefix}.png`, buf);
      }
    }
  }

  // 7. OpenGraph / Social Share Image
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'og-image.png'),
    await sharp(Buffer.from(ogImageSvg), { density: 144 })
      .resize(1200, 630)
      .png({ compressionLevel: 9 })
      .toBuffer(),
  );

  console.log(
    'Generated complete Agendamea icon, logo, favicon.ico, PWA, and Windows/Microsoft Store asset suite.',
  );
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
