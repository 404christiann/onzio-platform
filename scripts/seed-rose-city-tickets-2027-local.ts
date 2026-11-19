import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import WebSocket from "ws";
import { validateMediaUpload } from "@/lib/media-validation";
import { publishWithReservation } from "@/scripts/lib/publish-with-reservation";
import { buildStoragePath } from "@/lib/storage-path";
import { ticketsContentSchema, TICKET_ARTWORK_SLOTS } from "@/lib/tickets-content";
async function main() {
    const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""), connection = new URL(process.env.SUPABASE_DB_URL ?? "");
    if (api.protocol !== "http:" || api.hostname !== "127.0.0.1" || api.port !== "55321" || connection.hostname !== "127.0.0.1" || connection.port !== "55322")
        throw new Error("Only isolated local55321/55322 allowed.");
    if (!process.argv.includes("--execute-local"))
        throw new Error("Pass --execute-local.");
    const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7", actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
    const client = createClient(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket } });
    const db = client.schema("onzio"), club = await db.from("clubs").select("slug,kind").eq("id", clubId).single();
    if (club.error || club.data.slug !== "rose-city" || club.data.kind !== "test")
        throw new Error("Expected Rose City test tenant.");
    const existing = await db.from("cinematic_tickets_content").select("club_id").eq("club_id", clubId).maybeSingle();
    if (existing.error)
        throw existing.error;
    if (existing.data)
        throw new Error("Tickets content exists; refusing overwrite.");
    const homepage = await db.from("homepage_revamp_content").select("*").eq("club_id", clubId).single();
    if (homepage.error)
        throw homepage.error;
    const protectedTables = ["about_page_content", "club_logo_page_content", "site_branding", "homepage_hero_content", "shop_kit_section", "shop_kit_photos"];
    const capture = async () => Object.fromEntries(await Promise.all(protectedTables.map(async (table) => { const r = await db.from(table).select("*").eq("club_id", clubId); if (r.error)
        throw r.error; return [table, r.data]; })));
    const before = await capture();
    const manifest = JSON.parse(await readFile("assets/rose-city-tickets-2027/manifest.json", "utf8"));
    const published: Record<string, {
        assetId: string;
        url: string;
        path: string;
        checksum: string;
    }> = {};
    for (const slot of TICKET_ARTWORK_SLOTS) {
        const input = manifest.assets[slot], bytes = await readFile(input.inputPath), hash = createHash("sha256").update(bytes).digest("hex");
        if (hash !== input.sha256)
            throw new Error("Unreviewed input " + slot);
        const validated = await validateMediaUpload({ bytes, metadata: { fileName: basename(input.inputPath), mimeType: "image/png", size: bytes.length, kind: "graphic" } });
        const hex = createHash("sha256").update("rose-city-tickets:" + slot + ":" + hash).digest("hex"), uploadId = hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-5" + hex.slice(13, 16) + "-a" + hex.slice(17, 20) + "-" + hex.slice(20, 32);
        const stagingPath = buildStoragePath({ clubId, surface: "homepage", assetId: uploadId, extension: validated.extension });
        const upload = await client.storage.from("onzio-upload-staging").upload(stagingPath, bytes, { contentType: validated.mimeType, upsert: true });
        if (upload.error)
            throw upload.error;
        const result = await publishWithReservation({ version: 1, uploadId, clubId, actorId, surface: "homepage", kind: "graphic", fileName: basename(input.inputPath), mimeType: validated.mimeType, claimedSize: bytes.length, stagingPath, expiresAt: Date.now() + 60000 });
        if (result.idempotent)
            await client.storage.from("onzio-upload-staging").remove([stagingPath]);
        const delivered = await fetch(result.publicUrl);
        if (!delivered.ok)
            throw new Error("Unavailable publication " + slot);
        const deliveredHash = createHash("sha256").update(Buffer.from(await delivered.arrayBuffer())).digest("hex");
        const asset = await db.from("media_assets").select("checksum_sha256").eq("club_id", clubId).eq("id", result.assetId).single();
        if (asset.error || deliveredHash !== asset.data.checksum_sha256)
            throw new Error("Delivered checksum mismatch " + slot);
        published[slot] = { assetId: result.assetId, url: result.publicUrl, path: result.storagePath, checksum: deliveredHash };
    }
    const content = ticketsContentSchema.parse(JSON.parse(await readFile("assets/rose-city-tickets-2027/copy.json", "utf8")));
    const stored = structuredClone(content) as unknown as Record<string, unknown>;
    for (const slot of TICKET_ARTWORK_SLOTS) {
        content.artwork[slot].assetId = published[slot].assetId;
        (stored.artwork as Record<string, unknown>)[slot] = { alt: content.artwork[slot].alt };
    }
    const corrected = structuredClone(homepage.data.content) as {
        prices: {
            rows: {
                id: string;
                description: string;
            }[];
        };
    };
    for (const row of corrected.prices.rows) {
        if (row.id === "tennis")
            row.description = row.description.replace("Closet ball", "Closest ball");
        if (row.id === "pusd")
            row.description = "Pasadena Unified School District students & staff";
    }
    const pg = new Client({ connectionString: connection.href });
    await pg.connect();
    await pg.query("begin");
    try {
        const update = await pg.query("update onzio.homepage_revamp_content set content=$1 where club_id=$2 and updated_at=$3 returning club_id", [JSON.stringify(corrected), clubId, homepage.data.updated_at]);
        if (update.rowCount !== 1)
            throw new Error("Homepage changed; refusing stale corrections.");
        const cols = TICKET_ARTWORK_SLOTS.map(slot => slot + "_media_asset_id");
        await pg.query("insert into onzio.cinematic_tickets_content(club_id,content," + cols.join(",") + ") values(" + Array.from({ length: 9 }, (_, i) => "$" + (i + 1)).join(",") + ")", [clubId, JSON.stringify(stored), ...TICKET_ARTWORK_SLOTS.map(slot => published[slot].assetId)]);
        await pg.query("commit");
    }
    catch (e) {
        await pg.query("rollback");
        throw e;
    }
    finally {
        await pg.end();
    }
    if (JSON.stringify(await capture()) !== JSON.stringify(before))
        throw new Error("Unrelated content changed.");
    const after = await db.from("homepage_revamp_content").select("*").eq("club_id", clubId).single();
    if (after.error)
        throw after.error;
    const expected = { ...homepage.data, content: corrected, updated_at: after.data.updated_at };
    if (JSON.stringify(after.data) !== JSON.stringify(expected))
        throw new Error("Homepage changed beyond approved copy corrections.");
    await writeFile("assets/rose-city-tickets-2027/local-import-receipt.json", JSON.stringify({ localOnly: true, clubId, media: published, content, otherContentPreserved: true, homepageCopyCorrections: ["Closest ball", "PUSD staff"], hostedWrites: false }, null, 2) + "\n");
    console.log(JSON.stringify({ localOnly: true, publishedMedia: 7, deliveredChecksums: 7, otherContentPreserved: true, homepageCopyCorrections: 2, hostedWrites: false }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : (error && typeof error === "object" && "message" in error ? String(error.message) : "Tickets import failed")); process.exitCode = 1; });
