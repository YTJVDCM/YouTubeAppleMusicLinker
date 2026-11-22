import { build } from 'esbuild';
import { mkdir, copyFile, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { packagedManifest, manifestResources } from './manifest.mjs';
const sourceManifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const manifest = packagedManifest(sourceManifest);
await mkdir('dist/extension', { recursive: true });
await build({ entryPoints: { background: 'src/entrypoints/background.ts', youtube: 'src/entrypoints/youtube.content.ts',
  options: 'src/entrypoints/options.ts', popup: 'src/entrypoints/popup.ts' }, outdir: 'dist/extension', bundle: true, format: 'iife', target: 'firefox140' });
await copyFile('src/entrypoints/options.html', 'dist/extension/options.html');
await copyFile('src/entrypoints/popup.html', 'dist/extension/popup.html');
await writeFile('dist/extension/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
// Both the root development manifest and the packaged manifest must resolve.
for (const [root, value] of [['.', sourceManifest], ['dist/extension', manifest]]) {
  for (const resource of manifestResources(value)) {
    const file = path.join(root, resource);
    await access(file);
    if (file.endsWith('.html')) {
      const html = await readFile(file, 'utf8');
      if (!/^<!doctype html>/i.test(html)) throw new Error(`Missing HTML doctype: ${file}`);
      for (const match of html.matchAll(/<script\s+src="([^"]+)"/g)) {
        await access(path.join(path.dirname(file), match[1]));
      }
    }
  }
}
await build({ entryPoints: ['worker/src/index.ts'], outfile: 'dist/worker/index.js', bundle: true, format: 'esm', target: 'es2022' });
await writeFile('dist/BUILD.txt', 'Load repository manifest.json or dist/extension/manifest.json after building. Worker requires separate private configuration.\n');
