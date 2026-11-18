import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Execute the repository's actual media validator unchanged. No database/network.
// Optional --dependency-root reuses an installed local development runtime.
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
const index = process.argv.indexOf('--dependency-root');
const dependencyRoot = index < 0 ? root : path.resolve(process.argv[index + 1]);
const require = createRequire(path.join(dependencyRoot, 'package.json'));
const esbuild = require('esbuild');
const compiled = await esbuild.build({
  entryPoints: [path.join(root, 'lib/media-validation.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  external: ['sharp'],
  plugins: [{ name: 'repository-contract-alias', setup(build) {
    build.onResolve({ filter: /^@\/lib\/contract-error$/ }, () => ({ path: path.join(root, 'lib/contract-error.ts') }));
  } }],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports);
const { validateMediaUpload } = module.exports;
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
const validated = [];
for (const [logicalName, asset] of Object.entries(manifest.assets)) {
  const bytes = await readFile(path.join(root, asset.inputPath));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== asset.sha256 || bytes.length !== asset.bytes) throw new Error('Bundle byte/checksum mismatch: ' + logicalName);
  const result = await validateMediaUpload({ bytes, metadata: {
    fileName: path.basename(asset.inputPath),
    mimeType: asset.mimeType,
    size: bytes.length,
    width: asset.width,
    height: asset.height,
    kind: asset.kind,
  } });
  if (result.width !== asset.width || result.height !== asset.height || result.hasAlpha !== asset.hasAlpha) throw new Error('Decoded metadata mismatch: ' + logicalName);
  validated.push({ logicalName, safe: result.safe, format: result.format, width: result.width, height: result.height, bytes: result.byteSize, hasAlpha: result.hasAlpha });
}
const receipt = { validatedAt: new Date().toISOString(), validator: 'lib/media-validation.ts', validatorSha256: createHash('sha256').update(await readFile(path.join(root, 'lib/media-validation.ts'))).digest('hex'), manifestSha256: createHash('sha256').update(await readFile(path.join(directory, 'manifest.json'))).digest('hex'), count: validated.length, hostedOrDatabaseWrites: false, validated };
await writeFile(path.join(directory, 'verification.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ count: validated.length, allPassedActualRepositoryValidator: true, receipt: 'assets/rose-city-2027/verification.json' }));
