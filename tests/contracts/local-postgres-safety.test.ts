import { describe, expect, it } from "vitest";
import { localMailpitBaseUrl } from "../helpers/environment";
import { localPostgresConfig } from "../helpers/local-postgres";

describe("isolated local database connection", () => {
  it("retains the established local default and accepts a separate loopback port", () => {
    expect(localPostgresConfig({})).toMatchObject({ host: "127.0.0.1", port: 54322 });
    expect(localPostgresConfig({ SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:55322/postgres" })).toEqual({ connectionString: "postgresql://postgres:postgres@127.0.0.1:55322/postgres" });
  });
  it("uses the isolated loopback mail capture without accepting hosted mail servers", () => {
    expect(localMailpitBaseUrl({})).toBe("http://127.0.0.1:54324");
    expect(localMailpitBaseUrl({ SUPABASE_TEST_MAILPIT_URL: "http://127.0.0.1:55324" })).toBe("http://127.0.0.1:55324");
    expect(() => localMailpitBaseUrl({ SUPABASE_TEST_MAILPIT_URL: "https://mail.hosted.example" })).toThrow("non-loopback");
  });
  it("rejects hosted connections and alternate-host query overrides", () => {
    expect(() => localPostgresConfig({ SUPABASE_DB_URL: "postgresql://postgres:password@db.hosted.example/postgres" })).toThrow("non-loopback");
    expect(() => localPostgresConfig({ SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1/postgres?host=db.hosted.example" })).toThrow("host override");
  });
});
