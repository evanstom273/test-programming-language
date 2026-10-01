import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

// Inspect actual pixels and PNG checksums, not just filenames or IHDR dimensions.
// Vite copies public assets without decoding them, so broken icons otherwise ship.
const icons = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['pwa-192x192.png', 192],
  ['pwa-512x512.png', 512],
  ['pwa-maskable-192x192.png', 192],
  ['pwa-maskable-512x512.png', 512]
];
let failed = false;
for (const [name, size] of icons) {
  try {
    const data = readFileSync(new URL('../public/' + name, import.meta.url));
    const png = PNG.sync.read(data, { checkCRC: true });
    assert.equal(png.width, size);
    assert.equal(png.height, size);
    assert.equal(png.data.length, size * size * 4);
    console.log(`PASS ${name}: decoded ${size}×${size} PNG with valid checksums`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
if (failed) process.exitCode = 1;
