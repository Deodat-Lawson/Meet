#!/usr/bin/env node
/**
 * Sets the version everywhere at once, or checks that everywhere agrees.
 *
 *   node scripts/version.mjs 1.2.0     set an explicit version
 *   node scripts/version.mjs minor     bump major / minor / patch
 *   node scripts/version.mjs --check   fail if the files disagree
 *
 * A version lives in nine places across this repo — seven package manifests,
 * a Gradle file and an Xcode project — and nothing kept them in step, so they
 * all sat at 1.0.0 through a rename and a feature release while the phone build
 * quietly stayed at 0.0.1. One command writes all of them; `--check` in CI stops
 * them drifting apart again.
 *
 * Android's versionCode is derived rather than incremented. It has to rise with
 * every release or the store refuses the upload, and a number maintained by hand
 * is a number that eventually collides — as a function of the version it cannot.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...bits) => path.join(root, ...bits);

const MANIFESTS = [
  'package.json',
  'packages/protocol/package.json',
  'packages/client-core/package.json',
  'packages/server/package.json',
  'packages/web/package.json',
  'packages/desktop/package.json',
  'packages/mobile/package.json',
];
const GRADLE = 'packages/mobile/android/app/build.gradle';
const PBXPROJ = 'packages/mobile/ios/MeetMobile.xcodeproj/project.pbxproj';

/** 1.2.3 → 10203. Monotonic for any version with minor and patch under 100. */
function androidVersionCode(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (minor > 99 || patch > 99) throw new Error(`${version}: minor and patch must stay under 100`);
  return major * 10000 + minor * 100 + patch;
}

const readJson = (file) => JSON.parse(readFileSync(p(file), 'utf8'));
const readText = (file) => readFileSync(p(file), 'utf8');

function currentVersions() {
  const found = new Map();
  for (const file of MANIFESTS) found.set(file, readJson(file).version);
  found.set(GRADLE, readText(GRADLE).match(/versionName\s+"([^"]+)"/)?.[1]);
  found.set(PBXPROJ, readText(PBXPROJ).match(/MARKETING_VERSION = ([^;]+);/)?.[1]);
  return found;
}

function write(version) {
  const code = androidVersionCode(version);

  for (const file of MANIFESTS) {
    const json = readJson(file);
    json.version = version;
    writeFileSync(p(file), `${JSON.stringify(json, null, 2)}\n`);
  }

  writeFileSync(
    p(GRADLE),
    readText(GRADLE)
      .replace(/versionCode\s+\d+/, `versionCode ${code}`)
      .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`),
  );

  writeFileSync(
    p(PBXPROJ),
    readText(PBXPROJ)
      .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${code};`)
      .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`),
  );

  console.log(`version ${version}  (android versionCode ${code})`);
  for (const file of [...MANIFESTS, GRADLE, PBXPROJ]) console.log(`  ${file}`);
}

/* ------------------------------------------------------------------- cli */

const arg = process.argv[2];

if (!arg) {
  console.error('usage: version.mjs <x.y.z | major | minor | patch | --check>');
  process.exit(2);
}

if (arg === '--check') {
  const found = currentVersions();
  const expected = found.get('package.json');
  const wrong = [...found].filter(([, v]) => v !== expected);
  if (wrong.length > 0) {
    console.error(`versions disagree — the root says ${expected}:`);
    for (const [file, v] of wrong) console.error(`  ${v ?? '(unreadable)'}  ${file}`);
    process.exit(1);
  }
  const gradleCode = Number(readText(GRADLE).match(/versionCode\s+(\d+)/)?.[1]);
  if (gradleCode !== androidVersionCode(expected)) {
    console.error(`android versionCode is ${gradleCode}, expected ${androidVersionCode(expected)} for ${expected}`);
    process.exit(1);
  }
  console.log(`all ${found.size} places agree on ${expected} (android versionCode ${gradleCode})`);
} else if (['major', 'minor', 'patch'].includes(arg)) {
  const [major, minor, patch] = readJson('package.json').version.split('.').map(Number);
  const next =
    arg === 'major' ? `${major + 1}.0.0` : arg === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
  write(next);
} else if (/^\d+\.\d+\.\d+$/.test(arg)) {
  write(arg);
} else {
  console.error(`not a version: ${arg}`);
  process.exit(2);
}
