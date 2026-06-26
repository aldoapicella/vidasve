import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import { allowedOrigins } from "./config.js";

export function corsHeaders(request: HttpRequest): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  const allow = allowedOrigins();
  const isAllowed = allow.includes(origin) || (process.env.APP_ENV !== "prod" && origin.startsWith("http://localhost:"));
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allow[0] ?? "http://localhost:5173",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,x-device-id",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  };
}

export function json(request: HttpRequest, status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: corsHeaders(request),
    jsonBody: body
  };
}

export function options(request: HttpRequest): HttpResponseInit {
  return {
    status: 204,
    headers: corsHeaders(request)
  };
}
