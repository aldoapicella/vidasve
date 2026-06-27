import { parseAllowedBboxes } from "./geo.js";

export function env(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

export function envBool(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (!value) return fallback;
  return value.toLowerCase() === "true";
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

export function publicConfig() {
  const turnstileSiteKey = env("TURNSTILE_SITE_KEY");
  const turnstileSecretKey = env("TURNSTILE_SECRET_KEY");
  return {
    defaultCenter: parseJson(env("DEFAULT_CENTER_JSON"), [10.6031, -66.9334]),
    defaultZoom: Number(env("DEFAULT_ZOOM", "11")),
    allowedBboxes: parseAllowedBboxes(env("ALLOWED_BBOXES_JSON")),
    azureMapsClientId: env("AZURE_MAPS_CLIENT_ID"),
    features: {
      mediaUploads: envBool("MEDIA_UPLOADS_ENABLED"),
      geocoding: envBool("GEOCODING_ENABLED")
    },
    captcha: turnstileSiteKey && turnstileSecretKey
      ? { provider: "turnstile", siteKey: turnstileSiteKey }
      : { provider: "text" }
  };
}

export function allowedOrigins(): string[] {
  return env("ALLOWED_ORIGINS", "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
