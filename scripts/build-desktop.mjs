import { build } from 'esbuild';
import { mkdir, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist/desktop');
await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, 'assets'), { recursive: true });
for (const file of ['index.html', 'styles.css']) await copyFile(resolve(root, 'public', file), resolve(output, file));
await copyFile(resolve(root, 'src/desktop/viewer.html'), resolve(output, 'viewer.html'));
const shared = { bundle: true, platform: 'browser', format: 'esm', target: 'es2022' };
await build({ ...shared, entryPoints: [resolve(root, 'src/client/main.ts')], outfile: resolve(output, 'assets/main.js'),
  plugins: [{ name: 'transport-local', setup(builder) {
    builder.onResolve({ filter: /^\.\/generation\.js$/ }, () => ({ path: resolve(root, 'src/desktop/generation.ts') }));
  } }],
});
await build({ ...shared, entryPoints: [resolve(root, 'src/desktop/worker.ts')], outfile: resolve(output, 'worker.js'),
  plugins: [{ name: 'import-sans-fichiers-node', setup(builder) {
    builder.onResolve({ filter: /^\.\/importer\.js$/ }, () => ({ path: resolve(root, 'src/server/importer-document.ts') }));
  } }],
});
await build({ ...shared, entryPoints: [resolve(root, 'src/desktop/viewer.ts')], outfile: resolve(output, 'viewer.js') });
console.log('Interface Tauri et moteur de conversion hors ligne : dist/desktop/');
