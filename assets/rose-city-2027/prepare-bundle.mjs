import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// No network, provider, database or upload operations. Originals are read only.
// Rebuild: node assets/rose-city-2027/prepare-bundle.mjs --source-root <approved-preview-root>
// Optional --dependency-root supports the existing local development runtime.
const args = process.argv.slice(2);
function arg(name, fallback) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
const sourceRoot = path.resolve(arg('--source-root', '/Users/christianalcala/Documents/ChatGPT/Rose City 2027 Revamp'));
const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, '../..');
const dependencyRoot = path.resolve(arg('--dependency-root', repositoryRoot));
const require = createRequire(path.join(dependencyRoot, 'package.json'));
const sharp = require('sharp');
const manifest = JSON.parse(await readFile(path.join(sourceRoot, 'assets/manifest.json'), 'utf8'));
const provenance = JSON.parse(await readFile(path.join(sourceRoot, 'assets/additional-provenance.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inputDirectory = path.join(directory, 'inputs');
await mkdir(inputDirectory, { recursive: true });
const rows = [
  ['crest', 'prepared/crest.webp', 'graphic', 'Header/footer branding; excluded from slideshow'],
  ['raffle', 'prepared/raffle.webp', 'graphic', 'One replaceable static raffle graphic, no clickable enlargement'],
  ['ticketMap', 'prepared/ticket.webp', 'graphic', 'One replaceable static Robinson Stadium ticket/map; show/hide collapses section'],
  ['trophies', 'prepared/trophies.webp', 'graphic', 'Championship media; filename does not determine copy/year'],
  ['seats', 'prepared/seats.webp', 'graphic', 'Decorative match/ticket card background'],
  ...Array.from({ length: 7 }, (_, i) => [`slideshow${i + 1}`, `prepared/photo-${i + 1}.webp`, 'photo', `Approved match photo ${i + 1}; all seven retained`]),
  ['player2027', 'prepared/player-2027.webp', 'graphic', 'Supplied 2027 City of Roses red player with Foothill Transit jersey sponsor'],
  ['foothillHeader', 'prepared/foothill.png', 'graphic', 'Official horizontal Foothill header wordmark, raster derivative'],
  ['heroPoster', 'prepared/hero-reference-frame.jpg', 'photo', 'Actual approved Bunny clip frame at0.1s; reduced-motion/poster fallback'],
  ['episodePoster', 'originals/behind-rose-poster.jpg', 'photo', 'Actual Behind the Rose S1E1 official YouTube thumbnail; click loads real episode'],
  ['matchSponsor', 'prepared/chickfila.webp', 'graphic', 'Reference match card Chick-fil-A sample sponsor; actual schedule/shared owner must be resolved'],
  ['sponsorChronic', 'originals/chronic-tacos.webp', 'graphic', 'Current carousel sponsor1; near-white lettering darkened only by approved renderer SVG filter, red strip preserved'],
  ['sponsorModern', 'originals/modern-woodmen.webp', 'graphic', 'Current carousel sponsor2; source colors unchanged'],
  ['sponsorNikys', 'originals/nikys-previous.webp', 'graphic', 'Current carousel sponsor3; source colors unchanged'],
  ['sponsorPlanted', 'originals/planted-beauty.webp', 'graphic', 'Current carousel sponsor4; source colors unchanged'],
  ['sponsorTepitoPrevious', 'originals/tepito-previous.webp', 'graphic', 'Prior sixth-set inventory source preserved; renderer uses selected Tepito source instead'],
  ['sponsorPackshot', 'originals/pack-shot.webp', 'graphic', 'Current carousel sponsor6; white source displayed with renderer CSS invert(1)'],
  ['sponsorTepitoSelected', 'prepared/tepito-on-white.webp', 'graphic', 'User-linked selected Tepito source for carousel sponsor5 on white; colors unchanged'],
  ['onzioWordmark', 'prepared/onzio-wordmark-white.png', 'graphic', 'Existing Onzio wordmark; renderer invert(1), opacity1, link https://onziofutbol.com/'],
  ...['instagram', 'facebook', 'tiktok', 'youtube'].map(name => [`social${name[0].toUpperCase()}${name.slice(1)}`, `prepared/${name}.svg`, 'graphic', 'Unchanged existing icon-path raster mask; approved brand treatment remains renderer-owned']),
  ['socialX', null, 'graphic', 'Unchanged existing X icon-path raster mask; approved black brand treatment remains renderer-owned'],
];

function sourceReceipt(relative, original, inputBytes) {
  const base = manifest.find(r => r.name === path.basename(relative));
  const known = provenance.find(r => r.file === 'assets/' + relative);
  const originalPath = base
    ? path.join(sourceRoot, 'assets/originals', base.source)
    : known?.source?.startsWith('/') ? known.source : path.join(sourceRoot, 'assets', relative);
  return {
    approvedPreviewInputReadOnlyPath: original,
    approvedPreviewInputSha256: hash(inputBytes),
    originalReadOnlyPath: originalPath,
    originalSha256: base?.original_sha256 ?? known?.sha256 ?? hash(inputBytes),
    originalDimensions: base?.original_dimensions ?? known?.dimensions ?? null,
    sourceUrlOrPath: known?.source ?? base?.receipts?.[0]?.path ?? original,
    sourceIds: base?.receipts?.map(r => ({ id: r.id, revision: r.metadata?.rev, path: r.path, contentHash: r.content_hash }))
      ?? (known?.source_id ? [{ id: known.source_id, revision: known.source_rev, path: known.source }] : []),
    approvedPreparation: base?.processing ?? known?.processing ?? 'Source unchanged; no recoloring or generated logo/subject changes',
  };
}

const assets = {};
for (const [logicalName, relative, kind, assignment] of rows) {
  const isSvg = relative?.endsWith('.svg') || logicalName === 'socialX';
  const original = relative ? path.join(sourceRoot, 'assets', relative) : path.join(repositoryRoot, 'public/images/logo/xLogo.svg');
  const bytes = await readFile(original);
  const inputMetadata = await sharp(bytes).metadata();
  const maximumDimension = kind === 'graphic' ? 3000 : 6000;
  const resize = Math.max(inputMetadata.width, inputMetadata.height) > maximumDimension;
  const extension = isSvg ? '.png' : resize ? '.webp' : path.extname(original);
  const filename = logicalName + extension;
  const destination = path.join(inputDirectory, filename);
  let processing = 'Exact copy of approved processed input; no visual/content changes';
  if (isSvg) {
    await sharp(bytes, { density: 384 }).resize(192, 192, { fit: 'contain' }).png().toFile(destination);
    processing = 'Existing SVG paths rasterized unchanged at192×192 PNG; no generated paths/recoloring; original SVG is code-native source and is not an upload input';
  } else if (resize) {
    await sharp(bytes).rotate().resize({ width: maximumDimension, height: maximumDimension, fit: 'inside', withoutEnlargement: true }).webp({ quality: 95 }).toFile(destination);
    processing = 'Proportional inside3000px resize for existing graphic upload constraint; no cropping, recoloring, or generated content; WebP quality95';
  } else {
    await copyFile(original, destination);
  }
  const output = await readFile(destination);
  const metadata = await sharp(output).metadata();
  const receipt = relative ? sourceReceipt(relative, original, bytes) : {
    approvedPreviewInputReadOnlyPath: original,
    approvedPreviewInputSha256: hash(bytes),
    originalReadOnlyPath: original,
    originalSha256: hash(bytes),
    sourceUrlOrPath: 'public/images/logo/xLogo.svg',
    sourceIds: [],
    approvedPreparation: 'Unchanged existing repository icon source',
  };
  // Foothill's approved source is the actual official SVG, not a guessed logo.
  if (logicalName === 'foothillHeader') {
    const source = provenance.find(r => r.file === 'assets/originals/foothill-official.svg');
    receipt.originalReadOnlyPath = path.join(sourceRoot, source.file);
    receipt.originalSha256 = source.sha256;
    receipt.sourceUrlOrPath = source.source;
    receipt.approvedPreparation = 'Official SVG rasterized to500×82 PNG; unchanged horizontal mountain/wave wordmark';
  }
  if (logicalName === 'heroPoster') {
    const source = provenance.find(r => r.file === 'assets/originals/hero-720p.mp4');
    receipt.originalReadOnlyPath = path.join(sourceRoot, source.file);
    receipt.originalSha256 = source.sha256;
    receipt.sourceUrlOrPath = source.source;
    receipt.approvedPreparation = 'Direct frame at0.1s of approved Bunny library723074/video d17c6dc6-ab9a-4b22-a7dd-1e55b4f1ad91; no generated footage';
  }
  assets[logicalName] = {
    inputPath: path.posix.join('assets/rose-city-2027/inputs', filename),
    kind,
    mimeType: metadata.format === 'jpeg' ? 'image/jpeg' : 'image/' + metadata.format,
    bytes: output.length,
    sha256: hash(output),
    width: metadata.width,
    height: metadata.height,
    hasAlpha: metadata.hasAlpha,
    assignment,
    processing,
    provenance: receipt,
    validation: {
      decoded: true,
      rasterFormat: ['jpeg', 'png', 'webp'].includes(metadata.format),
      withinDimensionLimit: metadata.width <= maximumDimension && metadata.height <= maximumDimension,
      withinByteLimit: output.length <= (kind === 'graphic' ? 5 : 15) * 1024 * 1024,
      graphicFormatAllowed: kind !== 'graphic' || ['png', 'webp'].includes(metadata.format),
    },
  };
  if (Object.values(assets[logicalName].validation).some(value => !value)) throw new Error('Input validation failed: ' + logicalName);
}
const bundle = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  purpose: 'Portable reviewed inputs for an isolated local Supabase import through the normal media pipeline; not public asset URLs or a completed content import',
  assetCount: Object.keys(assets).length,
  inputBytes: Object.values(assets).reduce((sum, asset) => sum + asset.bytes, 0),
  slideshowSourceOrder: [3, 1, 2, 4, 5, 6, 7],
  hero: { libraryId: '723074', videoId: 'd17c6dc6-ab9a-4b22-a7dd-1e55b4f1ad91', approvedPlayerUrl: 'https://player.mediadelivery.net/play/723074/d17c6dc6-ab9a-4b22-a7dd-1e55b4f1ad91', nativeDeliveryNeedsVerification: true, videoBytesExcluded: true },
  episode: { youtubeId: 'fJf_A4LdKDw', embedUrl: 'https://www.youtube.com/embed/fJf_A4LdKDw?rel=0&modestbranding=1&color=white' },
  fonts: {
    museoModerno: { path: 'public/fonts/museomoderno/MuseoModerno.ttf', weight: 900, sha256: hash(await readFile(path.join(repositoryRoot, 'public/fonts/museomoderno/MuseoModerno.ttf'))), license: 'SIL OFL', notice: 'public/fonts/museomoderno/OFL.txt', source: 'https://raw.githubusercontent.com/google/fonts/main/ofl/museomoderno/MuseoModerno%5Bwght%5D.ttf' },
    avenir: { bundled: false, reason: 'Mac local() font is preview-only; commercial webfont license and supplied hosted file remain a release dependency' },
    lemonMilk: { path: 'public/fonts/lemon-milk/LEMONMILK-BoldItalic.otf', notice: 'public/fonts/lemon-milk/READ_ME.txt', commercialReceiptVerified: false },
    phosphor: { bundled: false, reason: 'No separately editable Phosphor lettering required by current approved homepage; supplied art contains its own lettering' },
  },
  assets,
};
await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(bundle, null, 2) + '\n');
console.log(JSON.stringify({ assets: bundle.assetCount, inputBytes: bundle.inputBytes, output: 'assets/rose-city-2027/manifest.json' }));
