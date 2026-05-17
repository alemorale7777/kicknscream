// Generates PWA icons from inline SVG using sharp.
// Run with: node scripts/gen-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../public/icons");
mkdirSync(outDir, { recursive: true });

// Pitch & Floodlight color palette
const BG = "#0A1410"; // pitch-900
const TURF = "#1FB663";
const FLOOD = "#E8FF3C";
const INK = "#F5F7F4";

function squareSvg(size, { maskable = false } = {}) {
  // Maskable icons need ~10% safe-zone padding; we draw the wordmark smaller.
  const padFactor = maskable ? 0.18 : 0.08;
  const pad = Math.round(size * padFactor);
  const inner = size - pad * 2;
  // Stylized "KN" monogram + floodlight dot
  const fontSize = Math.round(inner * 0.52);
  const dotR = Math.round(inner * 0.06);
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}" rx="${maskable ? 0 : Math.round(size * 0.18)}" ry="${maskable ? 0 : Math.round(size * 0.18)}"/>
  <g transform="translate(${pad}, ${pad})">
    <text
      x="${inner / 2}"
      y="${inner / 2 + fontSize * 0.32}"
      font-family="Geist, Inter, system-ui, sans-serif"
      font-weight="900"
      font-size="${fontSize}"
      letter-spacing="-0.06em"
      text-anchor="middle"
      fill="${INK}">K<tspan fill="${TURF}">N</tspan></text>
    <circle cx="${inner * 0.88}" cy="${inner * 0.88}" r="${dotR}" fill="${FLOOD}"/>
  </g>
</svg>`;
}

async function out(name, size, { maskable = false } = {}) {
  const svg = squareSvg(size, { maskable });
  const buf = Buffer.from(svg);
  await sharp(buf).png().toFile(resolve(outDir, name));
  console.log(`wrote ${name} (${size}x${size}${maskable ? " maskable" : ""})`);
}

await out("icon-192.png", 192);
await out("icon-512.png", 512);
await out("icon-maskable-512.png", 512, { maskable: true });
await out("apple-touch-icon.png", 180);

// Also a 32x32 favicon
await out("favicon-32.png", 32);
console.log("done");
