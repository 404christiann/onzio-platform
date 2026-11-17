type Filter = { column: string; value: unknown; kind: "eq" | "in" };
class Query {
  request: { table: string; operation: string; payload?: unknown; filters: Filter[]; count?: string; head?: boolean };
  constructor(table: string) { this.request = { table, operation: "select", filters: [] }; }
  select(_columns = "*", options?: { count?: string; head?: boolean }) { Object.assign(this.request, options); return this; }
  delete() { this.request.operation = "delete"; return this; }
  update(payload: unknown) { this.request.operation = "update"; this.request.payload = payload; return this; }
  insert(payload: unknown) { this.request.operation = "insert"; this.request.payload = payload; return this; }
  eq(column: string, value: unknown) { this.request.filters.push({ column, value, kind: "eq" }); return this; }
  in(column: string, value: unknown[]) { this.request.filters.push({ column, value, kind: "in" }); return this; }
  then(resolve: (result: { error: { message: string } | null; data: unknown; count: number }) => unknown, reject: (error: unknown) => unknown) {
    return fetch("/__cl23__/data", { method: "POST", body: JSON.stringify(this.request), headers: { "Content-Type": "application/json" } }).then((response) => response.json()).then(resolve, reject);
  }
}
export function createClient() {
  return {
    from: (table: string) => new Query(table),
    storage: {
      from: (_bucket: string) => ({
        async upload(path: string, file: File) {
          const response = await fetch(`/__cl23__/upload?path=${encodeURIComponent(path)}`, { method: "POST", body: file });
          return response.json();
        },
        getPublicUrl(path: string) { return { data: { publicUrl: `${location.origin}/storage/v1/object/public/sponsors/${path}` } }; },
        async remove(paths: string[]) {
          const response = await fetch("/__cl23__/retire", { method: "POST", body: JSON.stringify(paths) });
          return response.json();
        },
      }),
    },
  };
}
