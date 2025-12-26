import { readFileSync, writeFileSync } from 'fs';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const version = manifest.version;

// Sync to constants.ts
let constants = readFileSync('src/constants.ts', 'utf8');
constants = constants.replace(/VERSION = '[^']+'/, `VERSION = '${version}'`);
writeFileSync('src/constants.ts', constants);

// Sync to package.json
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.version = version;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

console.log(`Synced version: ${version}`);
