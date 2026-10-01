#!/usr/bin/env node
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

function getGitOutput(cmd, fallback = '') {
  try {
    return execSync(cmd, { cwd: ROOT_DIR, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

// Read root package.json
const rootPkgPath = path.join(ROOT_DIR, 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
const semver = rootPkg.version || '0.1.0';

// Git metadata
const commit = getGitOutput('git rev-parse --short HEAD', 'dev');
const fullCommit = getGitOutput('git rev-parse HEAD', 'development');
const branch = getGitOutput('git rev-parse --abbrev-ref HEAD', 'main');
const tag = getGitOutput('git describe --tags --exact-match', '');
const latestTag = getGitOutput('git describe --tags --abbrev=0', `v${semver}`);
const commitMsg = getGitOutput('git log -1 --pretty=%s', 'Working tree snapshot');
const commitDateRaw = getGitOutput('git log -1 --pretty=%cI', new Date().toISOString());
const commitCount = getGitOutput('git rev-list --count HEAD', '1');
const dirtyStatus = getGitOutput('git status --porcelain', '');
const isDirty = dirtyStatus.length > 0;

// Format dates in America/Sao_Paulo (GMT-3)
const now = new Date();
const buildTimeIso = now.toISOString();

function formatBR(d) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.day}/${map.month}/${map.year} ${map.hour}:${map.minute}:${map.second}`;
}

const buildTimeBR = formatBR(now);
let commitDateBR = buildTimeBR;
try {
  commitDateBR = formatBR(new Date(commitDateRaw));
} catch {
  // fallback
}

const displayVersion = `v${semver}${commit !== 'dev' ? `+${commit}` : ''}${isDirty ? '-dirty' : ''}`;

const versionInfo = {
  name: 'ThemisFlow',
  version: semver,
  displayVersion,
  buildTime: buildTimeIso,
  buildTimeBR,
  git: {
    commit,
    fullCommit,
    branch,
    tag: tag || null,
    latestTag,
    commitDate: commitDateRaw,
    commitDateBR,
    commitMessage: commitMsg,
    commitCount: Number(commitCount) || 1,
    isDirty,
  },
  environment: process.env.NODE_ENV || 'development',
};

const outputPaths = [
  path.join(ROOT_DIR, 'version.json'),
  path.join(ROOT_DIR, 'packages', 'core', 'src', 'version.json'),
  path.join(ROOT_DIR, 'apps', 'web', 'src', 'version.json'),
  path.join(ROOT_DIR, 'apps', 'api', 'src', 'version.json'),
];

for (const outPath of outputPaths) {
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outPath, JSON.stringify(versionInfo, null, 2) + '\n', 'utf-8');
}

console.log(`✓ Version metadata generated: ${displayVersion} (${commit} on ${branch})`);
