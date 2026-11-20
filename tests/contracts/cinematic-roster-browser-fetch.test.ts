import { beforeEach, describe, expect, it, vi } from "vitest";

// RC-SAM-FIXES: without a server first paint, the Rose City Roster reads the squad and the staff group in the browser.
const mocks = vi.hoisted(() => ({ roster: vi.fn(), staff: vi.fn() }));
vi.mock("@/lib/queries", () => ({ fetchRoster: mocks.roster, fetchStaff: mocks.staff }));
import { fetchCinematicRoster, loadCinematicRoster, type CinematicRosterState } from "@/components/cinematic/CinematicRosterPage";

const roster = { seasonId: "s", seasonLabel: "2027", goalkeepers: [], defenders: [], midfielders: [], forwards: [] };
const staff = [{ initials: "HC", name: "Sample Coach", role: "Head Coach", hometown: "", nationality: "", bio: null, image: "" }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.roster.mockResolvedValue(roster);
  mocks.staff.mockResolvedValue(staff);
});

describe("cinematic Roster browser read", () => {
  it("fetches the squad and the club's staff for the same club", async () => {
    await expect(fetchCinematicRoster("club-1")).resolves.toEqual({ roster, staff });
    expect(mocks.roster).toHaveBeenCalledWith(undefined, "club-1");
    expect(mocks.staff).toHaveBeenCalledWith("club-1");
  });
  it("fails as a whole when the staff read fails, so the page shows its retry message", async () => {
    mocks.staff.mockRejectedValue(new Error("boom"));
    await expect(fetchCinematicRoster("club-1")).rejects.toThrow("boom");
  });
});

describe("cinematic Roster browser load (the page effect)", () => {
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  it("shows loading, then keeps the fetched squad and staff for the club", async () => {
    const states: CinematicRosterState[] = [];
    loadCinematicRoster("club-1", state => states.push(state));
    await settle();
    expect(states).toEqual([
      { clubId: "club-1", roster: null, staff: [], failed: false },
      { clubId: "club-1", roster, staff, failed: false },
    ]);
  });
  it("records a failed read so the page shows its retry message", async () => {
    mocks.staff.mockRejectedValue(new Error("boom"));
    const states: CinematicRosterState[] = [];
    loadCinematicRoster("club-1", state => states.push(state));
    await settle();
    expect(states.at(-1)).toEqual({ clubId: "club-1", roster: null, staff: [], failed: true });
  });
  it("drops a late result after the club changes", async () => {
    const states: CinematicRosterState[] = [];
    const cancel = loadCinematicRoster("club-1", state => states.push(state));
    cancel();
    await settle();
    expect(states).toHaveLength(1);
  });
});
