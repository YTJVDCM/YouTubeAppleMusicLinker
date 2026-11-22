import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
await mkdir('dist/extension', { recursive: true });
await build({ entryPoints: { background: 'src/entrypoints/background.ts', youtube: 'src/entrypoints/youtube.content.ts',
  options: 'src/entrypoints/options.ts' }, outdir: 'dist/extension', bundle: true, format: 'iife', target: 'firefox128' });
await copyFile('src/entrypoints/options.html', 'dist/extension/options.html');
await copyFile('manifest.json', 'dist/extension/manifest.json');
await build({ entryPoints: ['worker/src/index.ts'], outfile: 'dist/worker/index.js', bundle: true, format: 'esm', target: 'es2022' });
await writeFile('dist/BUILD.txt', 'Load extension/manifest.json in Firefox about:debugging. Worker requires separate private configuration.\n');
