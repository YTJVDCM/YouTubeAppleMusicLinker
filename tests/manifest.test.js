import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { it, expect } from 'vitest';
import { packagedManifest, manifestResources } from '../scripts/manifest.mjs';

it('resolves root and packaged manifests to the same generated files', async () => {
  const source = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  const packaged = packagedManifest(source);
  const rootFiles = manifestResources(source).map(file => path.resolve(file));
  const packagedFiles = manifestResources(packaged).map(file => path.resolve('dist/extension', file));
  expect(rootFiles).toEqual(packagedFiles);
  // Existing empty root pages must never be the target of the development manifest.
  expect(source.action.default_popup).toBe('dist/extension/popup.html');
  expect(source.options_ui.page).toBe('dist/extension/options.html');
  expect(packaged.action.default_popup).toBe('popup.html');
  expect(source.background.scripts).toEqual(['dist/extension/background.js']);
  expect(packaged.background.scripts).toEqual(['background.js']);
});
it('rejects the previous broken root-resource layout instead of packaging it silently', async () => {
  const source = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  source.action.default_popup = 'popup.html';
  expect(() => packagedManifest(source)).toThrow('Expected generated extension resource');
});
it('keeps popup markup visible even without JavaScript and uses a standards doctype', async () => {
  const html = await readFile(new URL('../src/entrypoints/popup.html', import.meta.url), 'utf8');
  expect(html).toMatch(/^<!doctype html>/i);
  expect(html).toContain('<body><h1>Apple Music Linker</h1>');
  expect(html).toContain('表示状態を確認しています');
});
