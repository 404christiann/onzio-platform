const fixture = require("./site07-about-populated-fixture.json");

if (process.env.SITE07_ABOUT_POPULATED_FIXTURE !== "1") {
  throw new Error("About fixture preload requires explicit test-fixture mode.");
}

const upstreamFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async function aboutFixtureFetch(input, init) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = String(init?.method ?? input?.method ?? "GET").toUpperCase();
  if (!["http:", "https:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !["GET", "HEAD", "OPTIONS"].includes(method)) {
    throw new Error("About fixture server permits loopback read requests only.");
  }
  if (method === "GET" && url.pathname === "/rest/v1/about_page_content" &&
      url.searchParams.get("club_id") === `eq.${fixture.club_id}` &&
      url.searchParams.get("select") === "*" && url.searchParams.get("limit") === "1") {
    process.stdout.write("SITE07_ABOUT_FIXTURE_GET\n");
    return Response.json([fixture], { headers: { "x-onzio-test-fixture": "site07-about-populated" } });
  }
  const response = await upstreamFetch(input, { ...init, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("About fixture server does not follow redirects.");
  }
  return response;
};
