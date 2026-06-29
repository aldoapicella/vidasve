const apiBase = requiredEnv("API_BASE_URL").replace(/\/$/, "");
const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
const mode = process.env.SMOKE_MODE || "production";
const adminBase = process.env.ADMIN_API_BASE_PATH || "/admin";

if (mode === "production" && !appUrl) throw new Error("APP_URL is required for production smoke");

await check("GET /health", () => get("/health"));
await check("GET /health/deep", () => get("/health/deep"));
await check("GET /config", () => get("/config"));
await check("GET /maps/token", async () => {
  const body = await get("/maps/token");
  if (!body.token) throw new Error("missing map token");
});
await check("GET /reports", () => get("/reports"));
if (appUrl) {
  await check("OPTIONS /reports CORS", () => cors("/reports", appUrl, "POST"));
  await check("GET app", () => fetchOk(appUrl));
}
if (process.env.ADMIN_API_TOKEN) await check("GET admin moderation queue", () => adminGet(`${adminBase}/moderation`));

if (mode === "staging") {
  const stamp = new Date().toISOString();
  const created = await check("POST /reports staging", async () => post("/reports", {
    ...(await challengeFor("create_report")),
    addressText: `Smoke test ${stamp}`,
    knownInfoPublic: `Reporte automatico de smoke ${stamp}`,
    locationUnknown: true,
    locationAccuracy: "zone_only",
    type: "missing_last_seen",
    peopleCount: "unknown",
    captchaText: "VIDA",
    signsOfLife: false,
    riskFlags: [],
    sourceType: "other"
  }));
  const code = created.code;
  await check("GET created report", () => get(`/reports/${code}`));
  await check("GET search created report", async () => {
    const body = await get(`/search?q=${encodeURIComponent("Smoke test")}`);
    if (!Array.isArray(body.reports)) throw new Error("bad search response");
    if (!body.reports.some((report) => report.code === code)) throw new Error("created report missing from search");
  });
  await check("POST public text post", async () => post(`/reports/${code}/posts`, {
    ...(await challengeFor("public_post")),
    text: `Smoke post ${stamp}`,
    postType: "update",
    tags: ["smoke"]
  }));
  const ownerToken = new URL(created.ownerEditUrl).hash.match(/ownerToken=([^&]+)/)?.[1];
  if (!ownerToken) throw new Error("missing owner token");
  if (appUrl) await check("GET owner link app route", () => fetchOk(created.ownerEditUrl.replace(new URL(created.ownerEditUrl).origin, appUrl)));
  await check("POST owner resolved", async () => post(`/reports/${code}/owner-events`, {
    ...(await challengeFor("owner_event")),
    type: "owner_resolved",
    ownerToken,
    message: "Smoke owner resolved",
    reason: "smoke"
  }));
  await check("POST owner reopened", async () => post(`/reports/${code}/owner-events`, {
    ...(await challengeFor("owner_event")),
    type: "owner_reopened",
    ownerToken,
    message: "Smoke owner reopened"
  }));
  if (process.env.SMOKE_CLEANUP === "true" && process.env.ADMIN_API_TOKEN) {
    await check("POST cleanup remove report", () => adminPost(`${adminBase}/reports/${code}/remove`, { reason: "smoke_cleanup" }));
    await check("GET removed report returns 404", () => expectStatus(`/reports/${code}`, 404));
  }
}

console.log(JSON.stringify({ ok: true, mode }, null, 2));

async function check(name, fn) {
  try {
    const result = await fn();
    console.log(JSON.stringify({ ok: true, name }));
    return result;
  } catch (err) {
    console.error(JSON.stringify({ ok: false, name, error: err instanceof Error ? err.message : String(err) }));
    process.exitCode = 1;
    throw err;
  }
}

async function get(path) {
  return jsonFetch(`${apiBase}${path}`);
}

async function post(path, body) {
  return jsonFetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function jsonFetch(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function fetchOk(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
}

async function cors(path, origin, method) {
  const requestHeaders = path.startsWith("/admin/") || path.startsWith("/_admin/") ? "authorization,content-type" : "content-type";
  const response = await fetch(`${apiBase}${path}`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": method,
      "Access-Control-Request-Headers": requestHeaders
    }
  });
  if (!response.ok) throw new Error(`${response.status} CORS preflight`);
  if (response.headers.get("access-control-allow-origin") !== origin) throw new Error("missing CORS allow-origin");
  const allowedHeaders = response.headers.get("access-control-allow-headers")?.toLowerCase() ?? "";
  for (const header of requestHeaders.split(",")) {
    if (!allowedHeaders.includes(header)) throw new Error(`missing CORS allow-header ${header}`);
  }
}

async function expectStatus(path, status) {
  const response = await fetch(`${apiBase}${path}`);
  if (response.status !== status) throw new Error(`expected ${status}, got ${response.status}`);
}

async function adminGet(path) {
  return jsonFetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${process.env.ADMIN_API_TOKEN}` }
  });
}

async function adminPost(path, body) {
  return jsonFetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ADMIN_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function challengeFor(action) {
  const challenge = await post("/challenge", { action });
  return { challenge: { challenge, solution: await solvePow(challenge) } };
}

async function solvePow(challenge) {
  let solution = 0;
  while (true) {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${challenge.nonce}:${solution}`)));
    if (hasLeadingZeroBits(bytes, challenge.difficulty)) return String(solution);
    solution += 1;
    if (solution % 500 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function hasLeadingZeroBits(bytes, bits) {
  let remaining = bits;
  for (const byte of bytes) {
    if (remaining <= 0) return true;
    if (remaining >= 8) {
      if (byte !== 0) return false;
      remaining -= 8;
    } else {
      return byte >> (8 - remaining) === 0;
    }
  }
  return remaining <= 0;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
}
