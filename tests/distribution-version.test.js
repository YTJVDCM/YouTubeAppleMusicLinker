import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { it, expect } from 'vitest';
import { resolveDistribution } from '../scripts/distribution-version.mjs';
const sha = `abcdef123456${'a'.repeat(28)}`;
it('uses the exact release tag for manifest and filename, independently of package.json', () => {
  expect(resolveDistribution(['v1.2.3'], '0.2.3', sha)).toEqual({ version: '1.2.3', tag: 'v1.2.3', filename: 'youtube_apple_music_linker-1.2.3.zip' });
  expect(resolveDistribution(['1.2.3'], '0.2.3', sha).version).toBe('1.2.3');
});
it('labels untagged commits as development builds rather than reusing an older release', () => {
  expect(resolveDistribution([], '0.2.3', sha)).toMatchObject({ version: '0.2.3', tag: '', filename: 'youtube_apple_music_linker-0.2.3-dev-abcdef123456.zip' });
});
it('rejects conflicting versions, prerelease tags, leading zeroes and unsafe tag content', () => {
  for (const tags of [['v1.2.3', 'v1.2.4'], ['v1.2.3-beta.1'], ['v01.2.3'], ['v1.2.3\nBAD=value'], ['v1.2.3\n']]) {
    expect(() => resolveDistribution(tags, '0.2.3', sha)).toThrow();
  }
  expect(resolveDistribution(['v1.2.3', '1.2.3'], '0.2.3', sha).version).toBe('1.2.3');
});
it('detects both annotated and lightweight tags without modifying project tags', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'addon-version-'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  try {
    git('init', '--quiet');
    git('-c', 'user.name=codex', '-c', 'user.email=noreply@openai.com', 'commit', '--allow-empty', '--quiet', '-m', 'fixture');
    git('tag', 'v1.2.3');
    git('-c', 'user.name=codex', '-c', 'user.email=noreply@openai.com', 'tag', '-a', '1.2.3', '-m', 'fixture');
    const result = resolveDistribution(git('tag', '--points-at', 'HEAD').split('\n'), '0.2.3', git('rev-parse', 'HEAD'));
    expect(result.version).toBe('1.2.3');
  } finally { await rm(root, { recursive: true, force: true }); }
});
