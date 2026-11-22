import { execFileSync } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function validateVersion(value) {
  if (typeof value !== 'string' || /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.exec(value)?.[0] !== value) {
    throw new Error('Distribution version must be X.Y.Z without leading zeros or prerelease suffixes');
  }
  return value;
}

export function resolveDistribution(tags, packageVersion, revision) {
  if (typeof revision !== 'string' || /^[a-f\d]{40}$/i.exec(revision)?.[0] !== revision) throw new Error('Invalid Git revision');
  const releases = tags.filter(tag => /^v?\d+\./.test(tag)).map(tag => ({ tag, version: validateVersion(tag.replace(/^v/, '')) }));
  const versions = new Set(releases.map(item => item.version));
  if (versions.size > 1) throw new Error('Multiple release versions tag HEAD; select an unambiguous revision');
  const release = releases.sort((a, b) => a.tag.localeCompare(b.tag))[0];
  const version = release?.version ?? validateVersion(packageVersion);
  return { version, tag: release?.tag ?? '',
    filename: `youtube_apple_music_linker-${version}${release ? '' : `-dev-${revision.slice(0, 12).toLowerCase()}`}.zip` };
}

async function main() {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const revision = git('rev-parse', 'HEAD');
  const tags = git('tag', '--points-at', 'HEAD').split('\n').filter(Boolean);
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const result = resolveDistribution(tags, pkg.version, revision);
  console.log(`Distribution: ${result.filename} (${result.tag || 'untagged development build'})`);
  if (process.env.GITHUB_ENV) {
    await appendFile(process.env.GITHUB_ENV, `DISTRIBUTION_VERSION=${result.version}\nDISTRIBUTION_TAG=${result.tag}\nWEB_EXT_FILENAME=${result.filename}\n`);
  }
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `version=${result.version}\ntag=${result.tag}\nfilename=${result.filename}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
