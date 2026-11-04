import { readFile,writeFile,mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import sharp from "sharp";
const source=resolve("../..");
const sources={
 banner:"tickets/Rose City FC Tickets Banner 2027.jpg",seat:"tickets/Seat graphic.png",card:"tickets/credit card graphic.png",
 raffle:"tickets/Raffle Ticket graphic.png",bus:"tickets/Foothill Transit Bus graphic.png",map:"tickets/Rose City FC Bus Route Zoom Map graphic.png",
 partner:"Chick-fil-A_Pasadena_Logo_Red_png.png",
};
await mkdir("assets/rose-city-tickets-2027/inputs",{recursive:true});
const assets={};
for(const [slot,file] of Object.entries(sources)){
 const original=await readFile(resolve(source,"assets/originals",file));
 let image=sharp(original);if(slot==="partner")image=image.extract({left:132,top:590,width:805,height:181});
 const output=await image.png({compressionLevel:9}).toBuffer();const metadata=await sharp(output).metadata();
 const path="assets/rose-city-tickets-2027/inputs/"+slot+".png";await writeFile(path,output);
 assets[slot]={inputPath:path,sourcePath:"assets/originals/"+file,sourceSha256:createHash("sha256").update(original).digest("hex"),sha256:createHash("sha256").update(output).digest("hex"),width:metadata.width,height:metadata.height,processing:slot==="partner"?"Exact source rectangle, excluding empty canvas":"Lossless PNG preparation; original dimensions preserved"};
}
await writeFile("assets/rose-city-tickets-2027/manifest.json",JSON.stringify({localOnly:true,reference:"references/tickets-2027/reference.jpg",assets},null,2)+"\n");
console.log("Prepared seven source-preserving graphics.");

