import { readFileSync } from "node:fs";

const apiBase = (process.env.API_BASE_URL || "http://127.0.0.1:7071/api").replace(/\/$/, "");
const file = process.argv[2];
if (!file) {
  console.error("usage: API_BASE_URL=https://.../api npm run import:reports -- verified.csv");
  process.exit(1);
}

for (const row of parseCsv(readFileSync(file, "utf8"))) {
  const payload = toReport(row);
  const challenge = await challengeFor("create_report");
  const response = await fetch(`${apiBase}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, challenge })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  console.log(JSON.stringify({ code: body.code, ownerEditUrl: body.ownerEditUrl }));
  await new Promise((resolve) => setTimeout(resolve, 300));
}

function toReport(row) {
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  const persons = row.personsJson
    ? JSON.parse(row.personsJson)
    : row.personName
      ? [{
          id: crypto.randomUUID(),
          displayName: row.personName,
          age: row.personAge ? Number(row.personAge) : undefined,
          status: row.personStatus || "needs_verification",
          lastKnownPlace: row.lastKnownPlace || undefined,
          lastContactText: row.lastContactText || undefined
        }]
      : [];
  return {
    location: Number.isFinite(lat) && Number.isFinite(lng) ? { type: "Point", coordinates: [lng, lat] } : undefined,
    locationUnknown: !(Number.isFinite(lat) && Number.isFinite(lng)),
    locationAccuracy: Number.isFinite(lat) && Number.isFinite(lng) ? "approximate" : "zone_only",
    addressText: required(row.addressText, "addressText"),
    knownInfoPublic: required(row.knownInfoPublic, "knownInfoPublic"),
    type: row.type || "missing_last_seen",
    peopleCount: row.peopleCount || (persons.length === 1 ? "1" : persons.length ? "2-5" : "unknown"),
    persons,
    personDescriptionPublic: persons.map((person) => person.displayName).join("; "),
    lastContactAt: row.lastContactAt || undefined,
    lastContactText: row.lastContactText || undefined,
    captchaText: "VIDA",
    signsOfLife: row.signsOfLife === "true",
    riskFlags: row.riskFlags ? row.riskFlags.split("|").filter(Boolean) : [],
    sourceType: row.sourceType || "other",
    reporterNamePublic: row.reporterNamePublic || undefined,
    reporterContact: row.reporterContact || undefined
  };
}

async function challengeFor(action) {
  const response = await fetch(`${apiBase}/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action })
  });
  const challenge = await response.json();
  return { challenge, solution: await solvePow(challenge) };
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

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(headerLine);
  return lines.filter(Boolean).map((line) => Object.fromEntries(splitCsvLine(line).map((value, index) => [headers[index], value])));
}

function splitCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values.map((item) => item.trim());
}

function required(value, name) {
  if (!value) throw new Error(`missing ${name}`);
  return value;
}
