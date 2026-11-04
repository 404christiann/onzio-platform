import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import sharp from "sharp";

const outer = resolve("../..");
const folder = "assets/rose-city-shop-2027";
await mkdir(`${folder}/inputs`, { recursive: true });
const assets = {};
const sources = [
  ["homeLead", 'Rose City FC "City of Roses" Foothill Transit Front crop 2027.png', "photo"],
  ["awayLead", "shop-2027/away-lead.webp", "photo"],
  ...["home", "away"].flatMap(variant => Array.from({ length: 6 }, (_, i) => [`${variant}Row${i + 1}`, `shop-2027/${variant}-${i + 1}.webp`, "photo"])),
  ["map", "tickets/Rose City FC Bus Route Zoom Map graphic.png", "graphic"],
];
for (const [slot, file, kind] of sources) {
  const original = await readFile(resolve(outer, "assets/originals", file));
  let output = original, extension = file.split(".").at(-1), processing = "Exact original copy; no preparation re-encoding";
  if (slot === "homeLead") {
    // Identical alpha-only crop used by the accepted preview; no lossy prep.
    output = await sharp(original).extract({ left: 208, top: 84, width: 2584, height: 3563 }).png({ compressionLevel: 9 }).toBuffer();
    extension = "png"; processing = "Accepted alpha-only source rectangle208,84,2584,3563; lossless PNG. One normalization at publication.";
  }
  const metadata = await sharp(output).metadata();
  const path = `${folder}/inputs/${slot}.${extension}`;
  await writeFile(path, output);
  assets[slot] = { inputPath: path, kind, mimeType: extension === "png" ? "image/png" : "image/webp", bytes: output.length, width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha, sourcePath: `assets/originals/${file}`, sourceSha256: createHash("sha256").update(original).digest("hex"), sha256: createHash("sha256").update(output).digest("hex"), processing };
}
await writeFile(`${folder}/manifest.json`, JSON.stringify({ reference: "references/shop-2027/reference.jpg", approvedPreview: "design-explorations/shop-2027", assets }, null, 2) + "\n");
console.log(`Prepared ${sources.length} original-source Shop inputs`);
