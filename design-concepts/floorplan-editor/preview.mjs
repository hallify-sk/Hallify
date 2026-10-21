import { createServer, build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { copyFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('.', import.meta.url));
const project = resolve(root, '../..');
const config = {
  configFile: false, root, publicDir: resolve(project, 'static'),
  plugins: [svelte({ configFile: false })],
  resolve: { alias: { $lib: resolve(project, 'src/lib') } },
  server: { host: '127.0.0.1', port: 4186, strictPort: true, fs: { allow: [project] }, watch: { ignored: ['**/screenshots/**', '**/dist/**', '**/*.md'] } },
  build: { outDir: 'dist', emptyOutDir: true },
};
if (process.argv.includes('--build')) {
  await build(config);
  for (const name of ['AUDIT.md', 'VALIDATION.md']) await copyFile(resolve(root,name),resolve(root,'dist',name));
}
else { const server = await createServer(config); await server.listen(); server.printUrls(); }
