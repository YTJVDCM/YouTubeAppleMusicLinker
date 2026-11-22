const outputPrefix = 'dist/extension/';
export function packagedManifest(source) {
  const manifest = structuredClone(source);
  function packagedPath(value) {
    if (typeof value !== 'string' || !value.startsWith(outputPrefix)) {
      throw new Error(`Expected generated extension resource: ${value}`);
    }
    const relative = value.slice(outputPrefix.length);
    if (!relative || relative.split('/').includes('..')) throw new Error('Invalid extension resource');
    return relative;
  }
  manifest.background.scripts = manifest.background.scripts.map(packagedPath);
  manifest.action.default_popup = packagedPath(manifest.action.default_popup);
  manifest.options_ui.page = packagedPath(manifest.options_ui.page);
  for (const content of manifest.content_scripts) content.js = content.js.map(packagedPath);
  return manifest;
}
export function manifestResources(manifest) {
  return [...manifest.background.scripts, manifest.action.default_popup, manifest.options_ui.page,
    ...manifest.content_scripts.flatMap(content => content.js)];
}
