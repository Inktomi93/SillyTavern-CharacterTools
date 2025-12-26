/* eslint-disable no-undef */
/* eslint-env node */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const version = manifest.version;
const tag = `v${version}`;

function run(cmd) {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
}

// Check for uncommitted changes
try {
    execSync('git diff-index --quiet HEAD --');
} catch {
    console.error('Error: You have uncommitted changes. Commit or stash them first.');
    process.exit(1);
}

// Check if tag already exists
try {
    execSync(`git rev-parse ${tag}`, { stdio: 'ignore' });
    console.error(`Error: Tag ${tag} already exists. Update manifest.json version first.`);
    process.exit(1);
} catch {
    // Tag doesn't exist, good
}

console.log(`\nReleasing ${tag}...\n`);

// Build
run('npm run build');

// Stage and commit
run('git add .');

try {
    run(`git commit -m "chore: release ${tag}"`);
} catch {
    console.log('Nothing to commit, continuing...');
}

// Tag
run(`git tag ${tag}`);

// Push
run('git push origin main --tags');

console.log(`\n✅ Released ${tag}`);
console.log('   GitHub Actions will create the release automatically.');
