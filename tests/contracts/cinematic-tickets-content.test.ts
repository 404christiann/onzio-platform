import { describe, expect, it } from "vitest";
import { emptyTicketsContent, hydrateTicketsContent, ticketsDraftSchema, ticketsDraftFingerprint, ticketsSaveSchema } from "@/lib/tickets-content";
import { normalizeLinkDestination } from "@/lib/link-destination";
import { randomUUID } from "node:crypto";
describe("Tickets content boundaries", () => {
    it.each(["//checkout.example.com", "javascript:alert(1)", "https://user:secret@checkout.example.com", "https://127.0.0.1/tickets", "https://checkout.example.com\\evil"])("rejects unsafe purchase URL %s", url => expect(normalizeLinkDestination(url)).toBeNull());
    it.each(["", "https://checkout.example.com", "https://checkout.example.com/event?quantity=1#tickets"])("accepts optional external HTTPS URL %s", url => expect(normalizeLinkDestination(url)).toBe(url));
    // The shared link rule (lib/link-destination.ts): a site path is kept, http:// is upgraded and spaces are trimmed.
    it.each([["/tickets", "/tickets"], ["http://checkout.example.com", "https://checkout.example.com"], [" https://checkout.example.com", "https://checkout.example.com"]])("normalizes purchase link %s", (url, expected) => expect(normalizeLinkDestination(url)).toBe(expected));
    it("does not copy club offers or trust delivery URLs in a save", () => {
        const content = emptyTicketsContent();
        expect(JSON.stringify(content)).not.toContain("Rose City");
        expect(content.purchaseUrl).toBe("");
        const request = { operationId: randomUUID(), expectedRevision: "0", designRevision: "design", content, retiredMediaAssetIds: [] };
        expect(ticketsSaveSchema.safeParse(request).success).toBe(true);
        expect(ticketsSaveSchema.safeParse({ ...request, club_id: randomUUID() }).success).toBe(false);
        expect(ticketsSaveSchema.safeParse({ ...request, content: { ...content, artwork: { ...content.artwork, banner: { assetId: null, alt: "", url: "https://attacker.test/image" } } } }).success).toBe(false);
    });
    it("keeps partial purchase-link typing safe in the editor preview", () => { const content = { ...emptyTicketsContent(), purchaseUrl: "https:/" }; expect(hydrateTicketsContent(content, [], false).purchaseUrl).toBe("https:/");
        expect(ticketsDraftSchema.safeParse(content).success).toBe(true); expect(() => hydrateTicketsContent(content, [])).toThrow(); });
    it("recognizes an unchanged recovered draft despite database JSON key ordering", () => { const content=emptyTicketsContent(); const database=Object.fromEntries(Object.entries(content).reverse()) as typeof content; expect(ticketsDraftFingerprint(database)).toBe(ticketsDraftFingerprint(content)); });
    it("hydrates only IDs present in the scoped media snapshot and preserves dimensions", () => {
        const id = randomUUID(), content = emptyTicketsContent();
        content.artwork.map = { assetId: id, alt: "Transit map" };
        expect(hydrateTicketsContent(content, []).artwork.map.url).toBeNull();
        const result = hydrateTicketsContent(content, [{ id, storage_bucket: "onzio-media", storage_path: "tenant/homepage/map.png", width: 2380, height: 1216 }]);
        expect(result.artwork.map.width).toBe(2380);
        expect(result.artwork.map.height).toBe(1216);
    });
});
