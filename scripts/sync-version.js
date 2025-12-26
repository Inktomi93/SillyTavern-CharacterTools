/* eslint-env node */
import { readFileSync, writeFileSync } from 'fs';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const version = manifest.version;

let constants = readFileSync('src/constants.ts', 'utf8');
constants = constants.replace(/VERSION = '[^']+'/, `VERSION = '${version}'`);
writeFileSync('src/constants.ts', constants);

console.log(`Synced version: ${version}`);
