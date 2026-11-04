import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import sharp from "sharp";
const bundle = import.meta.dirname, app = resolve(bundle, "../.."), workspace = resolve(app, "../..");
const originalRoot = resolve(workspace, "assets/originals"), preview = resolve(workspace, "design-explorations/chick-fil-a-2027");
const sources = {
  mealPass: "chick-fil-a/Chick-fil-A Meal Pass graphic.png", driveThru: "chick-fil-a/Chick-fil-A Drive-Thru graphic.png",
  freeTicket: "chick-fil-a/Chick-fil-A Free Game Ticket graphic.png", enjoyGame: "chick-fil-a/Chick-fil-A Enjoy the game graphic.png",
  map: "chick-fil-a/Rose City FC Chick-fil-A Route Zoom Map graphic.jpg", restaurant: "chick-fil-a/Chick-fil-A Drive-photo.png",
  partner: "Chick-fil-A_Pasadena_Logo_Red_png.png", background: "tickets/Background seat graphic.png",
};
const strips = { driveThru: "step-drive-thru.webp", freeTicket: "step-free-ticket.webp", enjoyGame: "step-enjoy-game.webp" };
const sha = b => createHash("sha256").update(b).digest("hex");
const assets = [];
await mkdir(resolve(bundle, "inputs"), { recursive: true });
for (const [slot, file] of Object.entries(sources)) {
  const original = await readFile(resolve(originalRoot, file));
  let output = original, processing = "Original supplied PNG bytes unchanged; publish through normal media pipeline once";
  if (strips[slot]) {
    // The preview strips are lossless crops/resizes of original red icon pixels.
    // Decode lossless WebP to lossless PNG; the publication pipeline performs its only lossy normalization.
    output = await sharp(await readFile(resolve(preview, "public/artwork", strips[slot]))).png({ compressionLevel: 9 }).toBuffer();
    processing = "Existing lossless original-icon strip decoded to lossless PNG; embedded caption omitted for editable DOM text. Normal publication performs one normalization.";
  } else if (slot === "map") {
    output = await sharp(original).png({ compressionLevel: 9 }).toBuffer();
    processing = "Original dedicated JPG decoded to lossless PNG without resizing/recoloring; normal graphic publication performs one normalization.";
  } else if (slot === "partner") {
    output = await sharp(original).extract({ left: 132, top: 590, width: 805, height: 181 }).png({ compressionLevel: 9 }).toBuffer();
    processing = "Original raster rectangle132,590,805,181 excludes empty canvas; lossless PNG, normal graphic publication once.";
  }
  const metadata = await sharp(output).metadata(), path = resolve(bundle, "inputs", `${slot}.png`);
  if (slot !== "restaurant" && (metadata.width > 3000 || metadata.height > 3000 || output.length > 5 * 1024 * 1024)) throw new Error(`Graphic exceeds normal limits: ${slot}`);
  if (slot === "restaurant" && (metadata.width > 6000 || metadata.height > 6000 || output.length > 15 * 1024 * 1024)) throw new Error("Restaurant photo exceeds normal limits");
  await writeFile(path, output);
  assets.push({ slot, path: relative(app, path), inputPath: relative(app, path), purpose: slot === "restaurant" ? "homepage-photo" : "homepage-artwork", surface: "homepage", kind: slot === "restaurant" ? "photo" : "graphic", sha256: sha(output), bytes: output.length, width: metadata.width, height: metadata.height,
    source: { file: `assets/originals/${file}`, sha256: sha(original) }, processing });
}
await writeFile(resolve(bundle, "manifest.json"), JSON.stringify({ localOnly: true, prepared: true, reference: "design-explorations/chick-fil-a-2027/reference.jpg", content: "copy.json", assets }, null, 2) + "\n");
await writeFile(resolve(bundle, "source-receipts.json"), await readFile(resolve(workspace, "assets/chick-fil-a-source-receipts.json")));
await writeFile(resolve(bundle, "font-source.json"), await readFile(resolve(preview, "phosphor-w00-font-source.json")));
console.log("Prepared8 authentic inputs; restaurant original bytes preserved; graphics inside normal upload limits.");
