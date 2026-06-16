import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';

// B&B Notes icon: deep purple background, white "B&B" text with a small note/bookmark symbol
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#5500cc;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1a0044;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#aa44ff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#7700ee;stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- Background rounded rect -->
  <rect width="512" height="512" rx="96" ry="96" fill="url(#bg)" />

  <!-- Decorative notebook pages (stacked) -->
  <rect x="136" y="108" width="252" height="320" rx="18" ry="18" fill="#ffffff" opacity="0.08" />
  <rect x="148" y="96" width="252" height="320" rx="18" ry="18" fill="#ffffff" opacity="0.10" />

  <!-- Main note card -->
  <rect x="160" y="84" width="252" height="320" rx="18" ry="18" fill="#ffffff" opacity="0.96" />

  <!-- Spine / binding line -->
  <rect x="160" y="84" width="28" height="320" rx="14" ry="14" fill="url(#accent)" />

  <!-- Ruled lines on the note -->
  <line x1="208" y1="148" x2="388" y2="148" stroke="#d0b8f0" stroke-width="5" stroke-linecap="round" />
  <line x1="208" y1="188" x2="388" y2="188" stroke="#d0b8f0" stroke-width="5" stroke-linecap="round" />
  <line x1="208" y1="228" x2="388" y2="228" stroke="#d0b8f0" stroke-width="5" stroke-linecap="round" />
  <line x1="208" y1="268" x2="340" y2="268" stroke="#d0b8f0" stroke-width="5" stroke-linecap="round" />

  <!-- "B&B" text centered on the note -->
  <text
    x="294"
    y="360"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="108"
    font-weight="700"
    fill="#390099"
    text-anchor="middle"
    dominant-baseline="alphabetic"
    letter-spacing="-4"
  >B&amp;B</text>
</svg>`;

async function generate() {
  const svgBuffer = Buffer.from(svgIcon);

  // 512x512
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile('public/icon-512x512.png');
  console.log('✓ icon-512x512.png');

  // 192x192
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile('public/icon-192x192.png');
  console.log('✓ icon-192x192.png');

  // favicon 32x32
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile('src/app/favicon.png');
  console.log('✓ favicon.png (32x32)');

  console.log('\nAlle Icons wurden generiert!');
}

generate().catch(console.error);
