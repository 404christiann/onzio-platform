import { config as loadEnv } from "dotenv";

const EXPECTED_HOST = "nsgtkwqkbyxkiwrhzsje.supabase.co";
const envFile = process.argv.find((argument) => !argument.startsWith("--") && argument.endsWith(".local"));
const compact = process.argv.includes("--compact");

if (!envFile) {
  throw new Error("Usage: node scripts/introspect-rose-city.mjs <path-to-env-file>");
}

loadEnv({ path: envFile, override: false });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("The env file must define NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

const parsedUrl = new URL(supabaseUrl);
if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== EXPECTED_HOST) {
  throw new Error(`Refusing to inspect unexpected Supabase host: ${parsedUrl.hostname}`);
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
};

const openApiResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
  method: "GET",
  headers: {
    ...headers,
    Accept: "application/openapi+json",
  },
});

if (!openApiResponse.ok) {
  throw new Error(`PostgREST OpenAPI request failed with ${openApiResponse.status}.`);
}

const openApi = await openApiResponse.json();
const definitions = openApi.definitions ?? {};

const tables = await Promise.all(
  Object.entries(definitions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(async ([name, definition]) => {
      const properties = definition.properties ?? {};
      const countResponse = await fetch(
        `${supabaseUrl}/rest/v1/${encodeURIComponent(name)}?select=*`,
        {
          method: "HEAD",
          headers: {
            ...headers,
            Prefer: "count=exact",
          },
        },
      );

      const contentRange = countResponse.headers.get("content-range");
      const count = contentRange?.split("/")[1] ?? null;

      return {
        name,
        count: count && count !== "*" ? Number(count) : null,
        countStatus: countResponse.status,
        required: definition.required ?? [],
        columns: Object.entries(properties).map(([column, schema]) => ({
          name: column,
          type: schema.type ?? null,
          format: schema.format ?? null,
          nullable: schema.nullable ?? false,
          default: schema.default ?? null,
          description: schema.description ?? null,
        })),
      };
    }),
);

const bucketResponse = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
  method: "GET",
  headers,
});
if (!bucketResponse.ok) {
  throw new Error(`Storage bucket listing failed with ${bucketResponse.status}.`);
}
const buckets = await bucketResponse.json();

const snapshot = {
  inspectedAt: new Date().toISOString(),
  host: EXPECTED_HOST,
  source: "Read-only PostgREST OpenAPI, HEAD row counts, and Storage bucket listing",
  tables,
  buckets: (buckets ?? [])
    .map((bucket) => ({
      name: bucket.name,
      public: bucket.public,
      fileSizeLimit: bucket.file_size_limit ?? null,
      allowedMimeTypes: bucket.allowed_mime_types ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name)),
};

if (compact) {
  const compactSnapshot = {
    inspectedAt: snapshot.inspectedAt,
    host: snapshot.host,
    tables: snapshot.tables.map((table) => ({
      name: table.name,
      count: table.count,
      countStatus: table.countStatus,
      primaryKey: table.columns
        .filter((column) => column.description?.includes("<pk/>"))
        .map((column) => column.name),
      foreignKeys: table.columns
        .filter((column) => column.description?.includes("<fk "))
        .map((column) => ({
          column: column.name,
          target: column.description.match(/table='([^']+)' column='([^']+)'/)?.slice(1).join(".") ?? null,
        })),
      columns: table.columns.map((column) => column.name),
    })),
    buckets: snapshot.buckets,
  };
  process.stdout.write(`${JSON.stringify(compactSnapshot, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
}
