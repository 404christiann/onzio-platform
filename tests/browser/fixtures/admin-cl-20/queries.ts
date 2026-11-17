import type { Player, FieldStats, GoalkeeperStats } from "@/lib/data";
export type PlayerMatchTrendPoint = { date: string; opponent: string; value: number; mins: number; rating: number | null };
const query = new URLSearchParams(location.search);
const field = (goals: number, assists: number, starts: number): FieldStats => ({ goals, assists, starts, tackles: 12, yellow: 1, red: 0, mins: starts * 80, offsides: 0, fouls: 0, foulsSuffered: 0 });
const keeper: GoalkeeperStats = { saves: 40, cleanSheets: 3, goalsAgainst: 8, starts: 10, mins: 900, yellow: 0, red: 0 };
const person = (id: string, name: string, position: Player["position"], stats: Player["stats"]): Player => ({ id, name, number: id === "keeper" ? 1 : 9, position, stats, image: "", nationality: "", height: "", weight: "", hometown: "", age: 20 });
const names = { maya: "Maya Chen", sam: "Sam Okafor", keeper: "Ava Chen" };
let rosterAttempts = 0;
declare global {
  interface Window {
    __cl20ReleaseRoster?: () => void;
    __cl20ReleaseTrend?: (id: string) => void;
    __cl20Requests: string[];
  }
}
window.__cl20Requests = [];
const pending = new Map<string, () => void>();
const counts = new Map<string, number>();
export async function fetchRoster(_season: undefined, clubId: string) {
  if (clubId !== "11111111-1111-4111-8111-111111111111") throw new Error("Wrong fixture club");
  rosterAttempts++;
  if (query.get("error") === "1" && rosterAttempts === 1) throw new Error("Local fixture retry");
  if (query.get("hold") === "1") await new Promise<void>((resolve) => { window.__cl20ReleaseRoster = resolve; });
  const mode = query.get("mode");
  const forwards = mode === "empty" ? [] : [person("maya", mode === "long" ? "Alexandre Montgomery-Fitzgerald de la Cruz Hernández the Third" : names.maya, "Forward", field(11, 4, 10)), person("sam", names.sam, "Forward", field(6, 3, 12))];
  if (mode === "many") for (let i = 0; i < 49; i++) forwards.push(person("extra-" + i, "Player " + i, "Forward", field(i % 5, i % 3, 8)));
  return { goalkeepers: mode === "empty" ? [] : [person("keeper", names.keeper, "Goalkeeper", keeper)], defenders: [], midfielders: [], forwards, seasonLabel: "Spring 2028" };
}
export async function fetchPlayerMatchTrend(id: string, gk: boolean, _season: undefined, clubId: string): Promise<PlayerMatchTrendPoint[]> {
  if (clubId !== "11111111-1111-4111-8111-111111111111") throw new Error("Wrong fixture club");
  window.__cl20Requests.push(id);
  const epoch = (counts.get(id) ?? 0) + 1;
  counts.set(id, epoch);
  const request = `${id}-${epoch}`;
  if (query.get("race") === "1") await new Promise<void>((resolve) => { pending.set(request, resolve); window.__cl20ReleaseTrend = (next) => { pending.get(next)?.(); pending.delete(next); }; });
  const mode = query.get("trend");
  const count = mode === "none" ? 0 : mode === "one" ? 1 : 3;
  return Array.from({ length: count }, (_, i) => ({ date: "2028-04-0" + (i + 1), opponent: ["Riverside", "Northgate", "Harbor City"][i], value: gk ? (query.get("race") === "1" ? epoch * 10 + i : i + 3) : id === "maya" ? i + 1 : i, mins: 90, rating: null }));
}
