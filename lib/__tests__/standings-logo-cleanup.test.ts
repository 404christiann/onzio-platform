import { describe, expect, it, vi } from "vitest";
import { logoUrlsNoLongerUsed } from "@/lib/standings-logo-cleanup";

// ADMIN-RE-11b: a copied table shares logo files across seasons. Only a file no
// league table row uses any more may be deleted from storage.

const A = "https://x.test/storage/v1/object/public/standings/teams/a.png";
const B = "https://x.test/storage/v1/object/public/standings/teams/b.png";

function client(result: { data: unknown; error: { message: string } | null } | Error) {
  const inFn = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const select = vi.fn(() => ({ in: inFn }));
  const from = vi.fn(() => ({ select }));
  return { from, select, inFn };
}

describe("logoUrlsNoLongerUsed", () => {
  it("keeps a file another season's row still uses (two seasons share a logo)", async () => {
    const reader = client({ data: [{ logo_url: A }], error: null });
    expect(await logoUrlsNoLongerUsed(reader, [A, B])).toEqual([B]);
    expect(reader.from).toHaveBeenCalledWith("league_standings");
    expect(reader.inFn).toHaveBeenCalledWith("logo_url", [A, B]);
  });

  it("deletes a file nothing uses", async () => {
    expect(await logoUrlsNoLongerUsed(client({ data: [], error: null }), [A, A, B])).toEqual([A, B]);
  });

  it("asks nothing when there is nothing to delete", async () => {
    const reader = client({ data: [], error: null });
    expect(await logoUrlsNoLongerUsed(reader, [])).toEqual([]);
    expect(reader.from).not.toHaveBeenCalled();
  });

  it("deletes nothing when the check fails, by an error or a thrown request", async () => {
    expect(await logoUrlsNoLongerUsed(client({ data: null, error: { message: "down" } }), [A])).toEqual([]);
    expect(await logoUrlsNoLongerUsed(client(new Error("offline")), [A])).toEqual([]);
  });
});
