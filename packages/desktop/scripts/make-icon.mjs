/**
 * Renders build/icon.html to the PNG and .icns assets electron-builder needs.
 *
 * Headless Chrome is the renderer because it already understands the gradients,
 * squircle radii and inset shadows the artwork is drawn with — no image library
 * needed, and the result is exactly what the source HTML describes.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

// This package is not an npm workspace, so puppeteer is resolved from the
// monorepo root rather than expecting a second copy here. The icon is a
// committed build artifact; this script only needs to run when it changes.
const require = createRequire(import.meta.url);
const puppeteer = require(path.resolve(process.cwd(), '../../node_modules/puppeteer'));

const here = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(here, '../build');
const iconset = path.join(buildDir, 'icon.iconset');
const masterPng = path.join(buildDir, 'icon.png');

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
await page.goto(`file://${path.join(buildDir, 'icon.html')}`, { waitUntil: 'networkidle0' });
await page.screenshot({ path: masterPng, omitBackground: true });
await browser.close();
console.log('rendered', masterPng);

// macOS wants every size present in the iconset; iconutil refuses otherwise.
rmSync(iconset, { recursive: true, force: true });
mkdirSync(iconset, { recursive: true });

const sizes = [16, 32, 64, 128, 256, 512, 1024];
for (const size of sizes) {
  const targets = [];
  if (size <= 512) targets.push(`icon_${size}x${size}.png`);
  if (size >= 32) targets.push(`icon_${size / 2}x${size / 2}@2x.png`);
  for (const name of targets) {
    execFileSync('sips', ['-z', String(size), String(size), masterPng, '--out', path.join(iconset, name)], {
      stdio: 'ignore',
    });
  }
}

execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(buildDir, 'icon.icns')]);
rmSync(iconset, { recursive: true, force: true });

if (!existsSync(path.join(buildDir, 'icon.icns'))) throw new Error('icns was not produced');
console.log('wrote', path.join(buildDir, 'icon.icns'));
