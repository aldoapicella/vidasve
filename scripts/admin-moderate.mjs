const apiBase = (process.env.API_BASE_URL || "").replace(/\/$/, "");
const adminBase = process.env.ADMIN_API_BASE_PATH || "/admin";
const token = process.env.ADMIN_API_TOKEN || "";
const [command, target, value] = process.argv.slice(2);

if (!apiBase || !token || !command) {
  console.error("usage: API_BASE_URL=https://.../api ADMIN_API_TOKEN=... node scripts/admin-moderate.mjs <queue|hide-report|show-report|remove-report|hide-event> [target] [reason]");
  process.exit(1);
}

if (command === "queue") {
  await output(await request(`${adminBase}/moderation`));
} else if (command === "hide-report") {
  await output(await request(`${adminBase}/reports/${required(target, "code")}/moderation`, "POST", { visibility: "hidden", reason: value || "admin_hide" }));
} else if (command === "show-report") {
  await output(await request(`${adminBase}/reports/${required(target, "code")}/moderation`, "POST", { visibility: "public", reason: value || "admin_restore" }));
} else if (command === "remove-report") {
  await output(await request(`${adminBase}/reports/${required(target, "code")}/remove`, "POST", { reason: value || "admin_remove" }));
} else if (command === "hide-event") {
  const [code, eventId] = required(target, "code:eventId").split(":");
  await output(await request(`${adminBase}/reports/${code}/events/${eventId}/moderation`, "POST", { visibility: "hidden", reason: value || "admin_hide_event" }));
} else {
  throw new Error(`unknown command ${command}`);
}

async function request(path, method = "GET", body) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(data)}`);
  return data;
}

function output(value) {
  console.log(JSON.stringify(value, null, 2));
}

function required(value, name) {
  if (!value) throw new Error(`missing ${name}`);
  return value;
}
