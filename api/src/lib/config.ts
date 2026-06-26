import { parseAllowedBboxes } from "./geo.js";

export function env(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

export function publicConfig() {
  return {
    defaultCenter: parseJson(env("DEFAULT_CENTER_JSON"), [10.6031, -66.9334]),
    defaultZoom: Number(env("DEFAULT_ZOOM", "11")),
    allowedBboxes: parseAllowedBboxes(env("ALLOWED_BBOXES_JSON")),
    azureMapsClientId: env("AZURE_MAPS_CLIENT_ID"),
    features: {
      mediaUploads: env("MEDIA_UPLOADS_ENABLED", "false") === "true",
      geocoding: env("GEOCODING_ENABLED", "false") === "true"
    }
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
