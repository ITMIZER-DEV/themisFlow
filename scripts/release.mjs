#!/usr/bin/env node
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const arg = process.argv[2] || 'patch';

function exec(cmd) {
  return execSync(cmd, { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
}

// 1. Read current version from root package.json
const rootPkgPath = path.join(ROOT_DIR, 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
const currentVersion = rootPkg.version || '0.1.0';

const [major, minor, patch] = currentVersion.split('.').map(Number);

let nextVersion = '';
if (arg === 'major') {
  nextVersion = `${major + 1}.0.0`;
} else if (arg === 'minor') {
  nextVersion = `${major}.${minor + 1}.0`;
} else if (arg === 'patch') {
  nextVersion = `${major}.${minor}.${patch + 1}`;
} else if (/^\d+\.\d+\.\d+/.test(arg)) {
  nextVersion = arg.replace(/^v/, '');
} else {
  console.error(`Tipo de release inválido: ${arg}. Use "patch", "minor", "major" ou uma versão semver (ex: 0.2.0).`);
  process.exit(1);
}

console.log(`\n🚀 Preparando release: v${currentVersion} → v${nextVersion}\n`);

// 2. Update package.json files
const pkgFiles = [
  path.join(ROOT_DIR, 'package.json'),
  path.join(ROOT_DIR, 'packages', 'core', 'package.json'),
  path.join(ROOT_DIR, 'apps', 'web', 'package.json'),
  path.join(ROOT_DIR, 'apps', 'api', 'package.json'),
];

for (const pkgFile of pkgFiles) {
  if (fs.existsSync(pkgFile)) {
    const content = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'));
    content.version = nextVersion;
    fs.writeFileSync(pkgFile, JSON.stringify(content, null, 2) + '\n', 'utf-8');
    console.log(`  ✓ Atualizado: ${path.relative(ROOT_DIR, pkgFile)}`);
  }
}

// 3. Generate version.json
console.log('\n📦 Atualizando metadados de versão...');
exec('node scripts/generate-version.mjs');

// 4. Git commit & tag
const shouldCommit = process.env.GIT_COMMIT !== 'false';

if (shouldCommit) {
  try {
    console.log('\n🏷️  Criando commit e tag Git...');
    exec('git add .');
    exec(`git commit -m "chore(release): v${nextVersion}"`);
    exec(`git tag -a "v${nextVersion}" -m "Release v${nextVersion}"`);
    console.log(`  ✓ Commit criado: chore(release): v${nextVersion}`);
    console.log(`  ✓ Tag Git criada: v${nextVersion}`);
    console.log(`\n🎉 Release v${nextVersion} criada com sucesso!`);
    console.log(`   Para enviar ao repositório remoto: git push && git push --tags\n`);
  } catch (err) {
    console.warn('⚠️  Aviso ao criar commit/tag Git:', err.message);
  }
} else {
  console.log(`\n✓ Arquivos atualizados para v${nextVersion} (commit git ignorado conforme configuração)`);
}
