import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import WebSocket from "ws";

const EXPECTED_HOST = "nsgtkwqkbyxkiwrhzsje.supabase.co";
const AUTHORIZATION_FLAG =
  "--authorize-read-only-export=rose-city-production";
const FINAL_FREEZE_FLAG =
  "--authorize-final-freeze=rose-city-production";
const FREEZE_AT_PREFIX = "--freeze-at=";
const PAGE_SIZE = 1000;
const STORAGE_PAGE_SIZE = 100;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");

process.umask(0o077);

function usage() {
  return [
    "Usage:",
    "  node scripts/export-rose-city-rehearsal.mjs \\",
    "    /absolute/path/to/rose-city/.env.local \\",
    "    /absolute/path/to/private-output-directory \\",
    `    ${AUTHORIZATION_FLAG}`,
    "",
    "For a separately approved final frozen export, also provide:",
    `  ${FINAL_FREEZE_FLAG}`,
    "  --freeze-at=<ISO-8601 administrator freeze timestamp>",
    "",
    "The exporter permits GET/HEAD plus the exact read-only Storage-list POST",
    `endpoint, accepts only ${EXPECTED_HOST}, and refuses output inside Git.`,
  ].join("\n");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sortedRows(rows) {
  return [...rows].sort((left, right) =>
    stableJson(left).localeCompare(stableJson(right)),
  );
}

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

function safeObjectName(name) {
  const leaf = basename(name).replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  return leaf.slice(0, 120) || "object";
}

function countFromContentRange(value) {
  const raw = value?.split("/")[1];
  return raw && raw !== "*" ? Number(raw) : null;
}

async function writePrivateFile(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, value, { mode: 0o600 });
  await chmod(path, 0o600);
}

async function writeJson(path, value) {
  await writePrivateFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function assertEmptyOutputDirectory(outputDirectory) {
  if (isInside(REPOSITORY_ROOT, outputDirectory)) {
    throw new Error("Refusing to write production export data inside the repository.");
  }
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  await chmod(outputDirectory, 0o700);
  const existing = await readdir(outputDirectory);
  if (existing.length > 0) {
    throw new Error("Output directory must be empty.");
  }
}

function createGuardedFetch(supabaseOrigin) {
  return async (input, init = {}) => {
    const requestUrl =
      typeof input === "string" || input instanceof URL
        ? new URL(input)
        : new URL(input.url);
    const method = (
      init.method ??
      (typeof input === "object" && "method" in input ? input.method : "GET")
    ).toUpperCase();

    if (requestUrl.origin !== supabaseOrigin) {
      throw new Error(`Refusing request to unexpected origin: ${requestUrl.origin}`);
    }
    const readOnlyStorageList =
      method === "POST" &&
      (requestUrl.pathname.startsWith("/storage/v1/object/list/") ||
        requestUrl.pathname.startsWith("/storage/v1/object/list-v2/"));
    if (!["GET", "HEAD"].includes(method) && !readOnlyStorageList) {
      throw new Error(`Read-only export blocked ${method} ${requestUrl.pathname}`);
    }
    if (
      !["/rest/v1/", "/auth/v1/", "/storage/v1/"].some((prefix) =>
        requestUrl.pathname.startsWith(prefix),
      )
    ) {
      throw new Error(`Refusing unexpected Supabase path: ${requestUrl.pathname}`);
    }
    return fetch(input, { ...init, method });
  };
}

function headersFor(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

async function tableCount({ supabaseUrl, table, key, guardedFetch }) {
  const response = await guardedFetch(
    `${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?select=*`,
    {
      method: "HEAD",
      headers: {
        ...headersFor(key),
        Prefer: "count=exact",
      },
    },
  );
  return {
    status: response.status,
    count: response.ok
      ? countFromContentRange(response.headers.get("content-range"))
      : null,
  };
}

async function exportTable({
  supabaseUrl,
  table,
  credentials,
  guardedFetch,
}) {
  let selected = null;
  for (const credential of credentials) {
    const probe = await tableCount({
      supabaseUrl,
      table,
      key: credential.key,
      guardedFetch,
    });
    if (probe.status >= 200 && probe.status < 300) {
      selected = { ...credential, beforeCount: probe.count };
      break;
    }
  }

  if (!selected) {
    return {
      table,
      status: "unavailable",
      reason: "Neither the server credential nor public credential can SELECT this table.",
      rows: [],
    };
  }

  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL(
      `${supabaseUrl}/rest/v1/${encodeURIComponent(table)}`,
    );
    url.searchParams.set("select", "*");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    const response = await guardedFetch(url, {
      method: "GET",
      headers: {
        ...headersFor(selected.key),
        Prefer: "count=exact",
      },
    });
    if (!response.ok) {
      throw new Error(`Table ${table} export failed with ${response.status}.`);
    }
    const page = await response.json();
    if (!Array.isArray(page)) {
      throw new Error(`Table ${table} did not return an array.`);
    }
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const after = await tableCount({
    supabaseUrl,
    table,
    key: selected.key,
    guardedFetch,
  });
  const stable =
    after.status >= 200 &&
    after.status < 300 &&
    selected.beforeCount === after.count &&
    (after.count === null || after.count === rows.length);

  return {
    table,
    status: stable ? "exported" : "changed_during_export",
    access: selected.name,
    beforeCount: selected.beforeCount,
    exportedCount: rows.length,
    afterCount: after.count,
    rows: sortedRows(rows),
  };
}

function safeAuthUser(user, factors) {
  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    aud: user.aud ?? null,
    role: user.role ?? null,
    isAnonymous: user.is_anonymous ?? false,
    createdAt: user.created_at ?? null,
    updatedAt: user.updated_at ?? null,
    confirmedAt: user.confirmed_at ?? null,
    emailConfirmedAt: user.email_confirmed_at ?? null,
    phoneConfirmedAt: user.phone_confirmed_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
    bannedUntil: user.banned_until ?? null,
    providers: Array.isArray(user.app_metadata?.providers)
      ? [...user.app_metadata.providers].sort()
      : [],
    factors: factors
      .map((factor) => ({
        id: factor.id,
        type: factor.factor_type ?? factor.type ?? null,
        status: factor.status ?? null,
        friendlyName: factor.friendly_name ?? null,
        createdAt: factor.created_at ?? null,
        updatedAt: factor.updated_at ?? null,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

async function listAuthUsers(client) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < PAGE_SIZE) break;
  }
  return users.sort((left, right) => left.id.localeCompare(right.id));
}

async function exportAuth(client) {
  const before = await listAuthUsers(client);
  const redacted = [];
  for (const user of before) {
    const { data, error } = await client.auth.admin.mfa.listFactors({
      userId: user.id,
    });
    if (error) throw error;
    redacted.push(safeAuthUser(user, data?.factors ?? []));
  }
  const after = await listAuthUsers(client);
  const beforeDigest = sha256(
    stableJson(before.map(({ id, updated_at }) => ({ id, updated_at }))),
  );
  const afterDigest = sha256(
    stableJson(after.map(({ id, updated_at }) => ({ id, updated_at }))),
  );
  return {
    status: beforeDigest === afterDigest ? "exported" : "changed_during_export",
    userCount: redacted.length,
    beforeDigest,
    afterDigest,
    users: redacted,
  };
}

async function listBucketObjects(client, bucket) {
  const objects = [];
  const pending = [""];
  const visited = new Set();

  while (pending.length > 0) {
    const prefix = pending.shift();
    if (visited.has(prefix)) continue;
    visited.add(prefix);

    for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
      const { data, error } = await client.storage.from(bucket).list(prefix, {
        limit: STORAGE_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;
      for (const entry of data ?? []) {
        const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id === null) {
          pending.push(objectPath);
        } else {
          objects.push({
            path: objectPath,
            id: entry.id,
            createdAt: entry.created_at ?? null,
            updatedAt: entry.updated_at ?? null,
            lastAccessedAt: entry.last_accessed_at ?? null,
            metadata: entry.metadata ?? null,
          });
        }
      }
      if ((data ?? []).length < STORAGE_PAGE_SIZE) break;
    }
  }

  return objects.sort((left, right) => left.path.localeCompare(right.path));
}

async function downloadStorageObject({
  client,
  outputDirectory,
  bucket,
  object,
}) {
  const { data, error } = await client.storage.from(bucket).download(object.path);
  if (error) throw error;
  const bytes = Buffer.from(await data.arrayBuffer());
  const digest = sha256(bytes);
  const localRelativePath = [
    "storage",
    "objects",
    encodeURIComponent(bucket),
    digest.slice(0, 2),
    `${digest}-${safeObjectName(object.path)}`,
  ].join("/");
  await writePrivateFile(resolve(outputDirectory, localRelativePath), bytes);
  return {
    ...object,
    byteSize: bytes.length,
    checksumSha256: digest,
    localRelativePath,
    metadataSize:
      typeof object.metadata?.size === "number" ? object.metadata.size : null,
    sizeMatchesMetadata:
      typeof object.metadata?.size !== "number" ||
      object.metadata.size === bytes.length,
  };
}

async function exportStorage(client, outputDirectory) {
  const { data: buckets, error } = await client.storage.listBuckets();
  if (error) throw error;
  const sortedBuckets = [...(buckets ?? [])].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const exportedBuckets = [];

  for (const bucket of sortedBuckets) {
    const before = await listBucketObjects(client, bucket.name);
    const objects = [];
    for (const object of before) {
      objects.push(
        await downloadStorageObject({
          client,
          outputDirectory,
          bucket: bucket.name,
          object,
        }),
      );
    }
    const after = await listBucketObjects(client, bucket.name);
    const beforeDigest = sha256(stableJson(before));
    const afterDigest = sha256(stableJson(after));
    exportedBuckets.push({
      id: bucket.id,
      name: bucket.name,
      public: bucket.public,
      fileSizeLimit: bucket.file_size_limit ?? null,
      allowedMimeTypes: bucket.allowed_mime_types ?? null,
      status:
        beforeDigest === afterDigest &&
        objects.every((object) => object.sizeMatchesMetadata)
          ? "exported"
          : "changed_during_export",
      beforeDigest,
      afterDigest,
      objectCount: objects.length,
      totalBytes: objects.reduce((total, object) => total + object.byteSize, 0),
      objects,
    });
  }

  return {
    status: exportedBuckets.every((bucket) => bucket.status === "exported")
      ? "exported"
      : "changed_during_export",
    bucketCount: exportedBuckets.length,
    objectCount: exportedBuckets.reduce(
      (total, bucket) => total + bucket.objectCount,
      0,
    ),
    totalBytes: exportedBuckets.reduce(
      (total, bucket) => total + bucket.totalBytes,
      0,
    ),
    buckets: exportedBuckets,
  };
}

async function listFiles(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, path)));
    } else if (entry.isFile()) {
      files.push(relative(root, path));
    }
  }
  return files.sort();
}

async function createChecksumLedger(outputDirectory) {
  const files = (await listFiles(outputDirectory)).filter(
    (file) => file !== "checksums.sha256",
  );
  const entries = [];
  for (const file of files) {
    const bytes = await readFile(resolve(outputDirectory, file));
    entries.push(`${sha256(bytes)}  ${file}`);
  }
  await writePrivateFile(
    resolve(outputDirectory, "checksums.sha256"),
    `${entries.join("\n")}\n`,
  );
  return entries.length;
}

async function scanJsonForSecrets(outputDirectory, secrets) {
  const hits = [];
  for (const file of await listFiles(outputDirectory)) {
    if (!file.endsWith(".json") && !file.endsWith(".md")) continue;
    const contents = await readFile(resolve(outputDirectory, file), "utf8");
    if (secrets.some((secret) => secret && contents.includes(secret))) {
      hits.push({ file, reason: "input_credential_value" });
    }
    if (/sk_live_[A-Za-z0-9]+/.test(contents)) {
      hits.push({ file, reason: "stripe_live_secret_pattern" });
    }
  }
  return hits;
}

async function main() {
  const positional = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  const finalFreeze = process.argv.includes(FINAL_FREEZE_FLAG);
  const freezeAtArgument = process.argv.find((argument) =>
    argument.startsWith(FREEZE_AT_PREFIX),
  );
  if (
    process.argv.includes("--help") ||
    !process.argv.includes(AUTHORIZATION_FLAG) ||
    finalFreeze !== Boolean(freezeAtArgument) ||
    positional.length !== 2
  ) {
    process.stdout.write(`${usage()}\n`);
    process.exitCode = process.argv.includes("--help") ? 0 : 1;
    return;
  }

  const [envFileRaw, outputDirectoryRaw] = positional;
  const freezeAt = freezeAtArgument
    ? new Date(freezeAtArgument.slice(FREEZE_AT_PREFIX.length))
    : null;
  if (freezeAt && Number.isNaN(freezeAt.getTime())) {
    throw new Error("The final-freeze timestamp must be valid ISO-8601.");
  }
  const envFile = resolve(envFileRaw);
  const outputDirectory = resolve(outputDirectoryRaw);
  await assertEmptyOutputDirectory(outputDirectory);
  loadEnv({ path: envFile, override: false, quiet: true });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      "The env file must define NEXT_PUBLIC_SUPABASE_URL, " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const parsedUrl = new URL(supabaseUrl);
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== EXPECTED_HOST) {
    throw new Error(`Refusing unexpected Supabase host: ${parsedUrl.hostname}`);
  }
  const guardedFetch = createGuardedFetch(parsedUrl.origin);
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { fetch: guardedFetch },
    realtime: { transport: WebSocket },
  });

  const startedAt = new Date().toISOString();
  if (freezeAt && freezeAt.getTime() > new Date(startedAt).getTime()) {
    throw new Error("The final-freeze timestamp cannot be after export start.");
  }
  const openApiResponse = await guardedFetch(`${supabaseUrl}/rest/v1/`, {
    method: "GET",
    headers: {
      ...headersFor(serviceRoleKey),
      Accept: "application/openapi+json",
    },
  });
  if (!openApiResponse.ok) {
    throw new Error(`PostgREST OpenAPI failed with ${openApiResponse.status}.`);
  }
  const openApi = await openApiResponse.json();
  const tableNames = Object.keys(openApi.definitions ?? {}).sort();
  const tableManifest = [];

  for (const table of tableNames) {
    process.stdout.write(`database ${table}\n`);
    const result = await exportTable({
      supabaseUrl,
      table,
      credentials: [
        { name: "server", key: serviceRoleKey },
        { name: "public", key: anonKey },
      ],
      guardedFetch,
    });
    if (result.status !== "unavailable") {
      await writeJson(
        resolve(outputDirectory, "database", `${table}.json`),
        result.rows,
      );
    }
    const { rows: _rows, ...summary } = result;
    tableManifest.push(summary);
  }

  process.stdout.write("auth users and MFA factors\n");
  const auth = await exportAuth(client);
  await writeJson(resolve(outputDirectory, "auth", "users.json"), auth.users);
  const { users: _users, ...authSummary } = auth;

  process.stdout.write("storage buckets and objects\n");
  const storage = await exportStorage(client, outputDirectory);
  await writeJson(
    resolve(outputDirectory, "storage", "inventory.json"),
    storage,
  );

  const secretHits = await scanJsonForSecrets(outputDirectory, [
    anonKey,
    serviceRoleKey,
  ]);
  const unstableTables = tableManifest.filter(
    (table) => table.status !== "exported",
  );
  const completedAt = new Date().toISOString();
  const complete =
    unstableTables.length === 0 &&
    auth.status === "exported" &&
    storage.status === "exported" &&
    secretHits.length === 0;
  const manifest = {
    formatVersion: 1,
    kind: finalFreeze
      ? "rose-city-final-frozen-export"
      : "rose-city-local-rehearsal-export",
    frozenSource: finalFreeze,
    finalCutoverArtifact: finalFreeze,
    freeze: finalFreeze
      ? {
          startedAt: freezeAt.toISOString(),
          acknowledgement:
            "Administrator no-edit acknowledgement relayed by Christian Alcala",
        }
      : null,
    status: complete ? "complete" : "incomplete",
    startedAt,
    completedAt,
    sourceHost: EXPECTED_HOST,
    sourceProjectRef: EXPECTED_HOST.split(".")[0],
    networkMethodsAllowed: [
      "GET",
      "HEAD",
      "POST /storage/v1/object/list/{bucket} (read-only listing only)",
    ],
    productionMutations: 0,
    database: {
      tableCount: tableManifest.length,
      exportedTableCount: tableManifest.filter(
        (table) => table.status === "exported",
      ).length,
      tables: tableManifest,
    },
    auth: authSummary,
    storage: {
      status: storage.status,
      bucketCount: storage.bucketCount,
      objectCount: storage.objectCount,
      totalBytes: storage.totalBytes,
    },
    secretScan: {
      status: secretHits.length === 0 ? "passed" : "failed",
      hits: secretHits,
    },
  };
  await writeJson(resolve(outputDirectory, "manifest.json"), manifest);
  await writePrivateFile(
    resolve(outputDirectory, "README.md"),
    [
      finalFreeze
        ? "# Rose City Phase 8 final frozen export"
        : "# Rose City Phase 8 local rehearsal export",
      "",
      "This is a read-only snapshot from the live Rose City source.",
      finalFreeze
        ? "It was captured after the recorded administrator content freeze and is the final cutover source artifact."
        : "It was captured without a content freeze and is not the final cutover artifact.",
      "No credential values, password hashes, sessions, refresh tokens, or MFA secrets",
      "are intentionally included. Auth output is a minimized identity/factor inventory.",
      "",
      `Status: ${manifest.status}`,
      ...(finalFreeze ? [`Freeze started: ${freezeAt.toISOString()}`] : []),
      `Started: ${startedAt}`,
      `Completed: ${completedAt}`,
      `Source: ${EXPECTED_HOST}`,
      "",
    ].join("\n"),
  );
  const checksumFileCount = await createChecksumLedger(outputDirectory);
  const outputStats = await stat(outputDirectory);
  if (!outputStats.isDirectory()) throw new Error("Export output disappeared.");

  process.stdout.write(
    `${JSON.stringify(
      {
        status: manifest.status,
        outputDirectory,
        tables: manifest.database,
        auth: manifest.auth,
        storage: manifest.storage,
        secretScan: manifest.secretScan.status,
        checksumFileCount,
      },
      null,
      2,
    )}\n`,
  );
  if (!complete) process.exitCode = 2;
}

await main();
