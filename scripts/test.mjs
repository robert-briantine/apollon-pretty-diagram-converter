import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Chaque recette recompile : elle fonctionne aussi sans dist/ préexistant.
const root = fileURLToPath(new URL('../', import.meta.url));
const name = process.argv[2];
const files = readdirSync(new URL('../tests/', import.meta.url))
  .filter(file => file.endsWith('.test.mjs')).sort().map(file => `tests/${file}`);
const cases = new Map();
for (const file of files) {
  const content = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  for (const [, testName] of content.matchAll(/test\('([^']+)',/g)) {
    if (cases.has(testName)) throw new Error(`Nom de test dupliqué : ${testName}`);
    cases.set(testName, file);
  }
}
if (process.argv.length > 3 || (name && !cases.has(name))) {
  console.error('Indiquer au plus un nom exact de cas existant dans tests/*.test.mjs.');
  process.exit(1);
}
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json']);
run(['node_modules/typescript/bin/tsc', '-p', 'tsconfig.client.json']);
run(['scripts/build-desktop.mjs']);
const filter = name ? [`--test-name-pattern=^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`] : [];
run(['--test', ...filter, ...(name ? [cases.get(name)] : files)]);
