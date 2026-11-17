type QueryData = { table: string; single: boolean; action: string; values?: unknown; filters: [string, unknown][]; range?: [number, number]; order?: [string, boolean] };
function query(table: string) {
 const data: QueryData = { table, single: false, action: "select", filters: [] };
 let proxy: any;
 proxy = new Proxy({}, { get(_target, key) {
  if (key === "then") return (resolve: any, reject: any) => fetch("/__cl24__/data", { method: "POST", body: JSON.stringify(data) }).then(response => response.json()).then(resolve, reject);
  return (...args: any[]) => {
   if (key === "single" || key === "maybeSingle") data.single = true;
   if (key === "insert" || key === "update" || key === "delete") { data.action = key; data.values = args[0]; }
   if (key === "eq") data.filters.push([args[0], args[1]]);
   if (key === "range") data.range = [args[0], args[1]];
   if (key === "order") data.order = [args[0], args[1]?.ascending !== false];
   return proxy;
  };
 } });
 return proxy;
}
export function createClient() {
 const client: any = { from: query, schema: () => client, auth: { getUser: async () => ({ data: { user: { id: "44444444-4444-4444-8444-444444444444" } }, error: null }) } };
 return client;
}
export const supabase = createClient();
