import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The shared local database keeps every audit row that committed suites and scripts ever wrote
// (tens of thousands for the Alpha test club). A snapshot helper that aggregates each of those
// rows into JSON or text takes seconds per call, and the database suites make hundreds of calls,
// so one such helper once turned a 5 minute suite into 26 minutes and caused timeout failures.
// Snapshots must use `count(*)` and `max(id)`, which still prove no audit row was added or removed.
const roots = ["tests/database", "tests/helpers"];
const auditSource = /\bfrom\s+(?:onzio\.)?audit_events\b/gi;
const rowAggregate = /\b(?:jsonb_agg|json_agg|string_agg|array_agg)\s*\(\s*(?:to_jsonb|row_to_json|\w+\s*(?:::\w+)?\s*[,)])/i;

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sources(path) : /\.(?:ts|mts|mjs)$/.test(entry.name) ? [path] : [];
  });
}

// Looks at the one sub-select each `from audit_events` sits in. A query built with a variable
// table name (`from ${table}`) cannot be seen here, so aggregate audit rows by name, not by variable.
export function unboundedAuditAggregates(text: string) {
  const found: string[] = [];
  for (const match of text.matchAll(auditSource)) {
    let depth = 0;
    let start = 0;
    for (let index = match.index - 1; index >= 0; index -= 1) {
      if (text[index] === ")") depth += 1;
      else if (text[index] === "(" && depth === 0) { start = index; break; }
      else if (text[index] === "(") depth -= 1;
    }
    const subselect = text.slice(start, match.index + match[0].length);
    if (rowAggregate.test(subselect)) found.push(subselect.replace(/\s+/g, " ").slice(0, 120));
  }
  return found;
}

describe("database test audit snapshots", () => {
  it("rejects an aggregate over every audit row", () => {
    expect(unboundedAuditAggregates("(select jsonb_agg(to_jsonb(s) order by id) from onzio.audit_events s where club_id=$1) as audit")).toHaveLength(1);
    expect(unboundedAuditAggregates("select encode(sha256(convert_to(string_agg(to_jsonb(s)::text,'' order by id),'UTF8')),'hex') from onzio.audit_events s")).toHaveLength(1);
  });

  it("accepts a count and highest id", () => {
    expect(unboundedAuditAggregates("(select count(*)::text||':'||coalesce(max(id),0)::text from onzio.audit_events where club_id=$1) as audit")).toEqual([]);
  });

  it("is not used by any database test or helper", () => {
    const offenders = roots
      .flatMap(sources)
      .filter((path) => path !== join("tests/architecture", "database-test-audit-snapshots.test.ts"))
      .flatMap((path) => unboundedAuditAggregates(readFileSync(path, "utf8")).map((found) => `${path}: ${found}`));
    expect(offenders).toEqual([]);
  });
});
