import { readFileSync, writeFileSync } from 'fs';
import process from 'process';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const version = manifest.version;

// Sync to constants.ts
const constants = readFileSync('src/constants.ts', 'utf8');
const versionPattern = /^export const VERSION = '[^']+'/m;

if (!versionPattern.test(constants)) {
    console.error('Failed to find VERSION in constants.ts - pattern not found');
    process.exit(1);
}

const newConstants = constants.replace(versionPattern, `export const VERSION = '${version}'`);
writeFileSync('src/constants.ts', newConstants);

// Sync to package.json
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.version = version;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

console.log(`Synced version: ${version}`);
