type QueryData = { table: string; single: boolean; action?: string; values?: unknown };
function query(table: string) {
  const data: QueryData = { table, single: false };
  let proxy: any;
  proxy = new Proxy({}, { get(_target, key) {
    if (key === "then") return (resolve: any, reject: any) => fetch("/__cl21__/data", { method: "POST", body: JSON.stringify(data) }).then(response => response.json()).then(resolve, reject);
    return (...args: unknown[]) => { if (key === "single" || key === "maybeSingle") data.single = true; if (key === "upsert") { data.action = "upsert"; data.values = args[0]; } return proxy; };
  } });
  return proxy;
}
export function createClient() {
  const client: any = { from: query, schema: () => client,
    auth: { getUser: async () => ({ data: { user: { id: "44444444-4444-4444-8444-444444444444" } }, error: null }) },
    storage: { from: () => ({
      upload: async (path: string, file: File) => (await fetch("/__cl21__/upload?path=" + encodeURIComponent(path), { method: "POST", body: file })).json(),
      getPublicUrl: (path: string) => ({ data: { publicUrl: location.origin + "/__cl21__/asset/" + path } }),
      remove: async (paths: string[]) => (await fetch("/__cl21__/cleanup", { method: "POST", body: JSON.stringify({ paths }) })).json(),
    }) },
  };
  return client;
}

export const supabase = createClient();
