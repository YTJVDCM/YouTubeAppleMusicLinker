import { build } from 'esbuild';
import { mkdir, copyFile, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { packagedManifest, manifestResources } from './manifest.mjs';
import { validateVersion } from './distribution-version.mjs';
const sourceManifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const manifest = packagedManifest(sourceManifest);
if (process.env.DISTRIBUTION_VERSION) manifest.version = validateVersion(process.env.DISTRIBUTION_VERSION);
await mkdir('dist/extension', { recursive: true });
await build({ entryPoints: { background: 'src/entrypoints/background.ts', youtube: 'src/entrypoints/youtube.content.ts',
  options: 'src/entrypoints/options.ts', popup: 'src/entrypoints/popup.ts' }, outdir: 'dist/extension', bundle: true, format: 'iife', target: 'firefox140' });
await copyFile('src/entrypoints/options.html', 'dist/extension/options.html');
await copyFile('src/entrypoints/popup.html', 'dist/extension/popup.html');
await copyFile('LICENSE', 'dist/extension/LICENSE');
let sourceNotice = 'Source code: the repository used to build this extension.\n';
if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_SHA) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(process.env.GITHUB_REPOSITORY) || !/^[a-f\d]{40}$/i.test(process.env.GITHUB_SHA)) {
    throw new Error('Invalid CI source revision');
  }
  sourceNotice = `Source code: https://github.com/${process.env.GITHUB_REPOSITORY}/tree/${process.env.GITHUB_SHA}\n`;
}
await writeFile('dist/extension/SOURCE.txt', `${sourceNotice}License: Mozilla Public License 2.0 (see LICENSE).\n`);
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
