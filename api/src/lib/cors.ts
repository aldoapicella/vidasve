import { brotliCompressSync, gzipSync } from "node:zlib";
import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import { allowedOrigins } from "./config.js";

export function corsHeaders(request: HttpRequest): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  const allow = allowedOrigins();
  const isAllowed = allow.includes(origin) || (process.env.APP_ENV !== "prod" && origin.startsWith("http://localhost:"));
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allow[0] ?? "http://localhost:5173",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,content-type,x-admin-token,x-device-id",
    "Vary": "Origin, Accept-Encoding",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  };
}

export function json(request: HttpRequest, status: number, body: unknown): HttpResponseInit {
  const headers = corsHeaders(request);
  const raw = JSON.stringify(body) ?? "null";
  const compressed = compressedJson(request, raw);
  if (compressed) {
    return {
      status,
      headers: {
        ...headers,
        "Content-Encoding": compressed.encoding
      },
      body: compressed.body
    };
  }
  return {
    status,
    headers,
    jsonBody: body
  };
}

export function options(request: HttpRequest): HttpResponseInit {
  return {
    status: 204,
    headers: corsHeaders(request)
  };
}

function compressedJson(request: HttpRequest, raw: string): { encoding: "br" | "gzip"; body: Buffer } | undefined {
  if (request.method !== "GET" || Buffer.byteLength(raw) < 1024) return undefined;
  const acceptEncoding = request.headers.get("accept-encoding") ?? "";
  const body = Buffer.from(raw);
  if (/\bbr\b/.test(acceptEncoding)) return { encoding: "br", body: brotliCompressSync(body) };
  if (/\bgzip\b/.test(acceptEncoding)) return { encoding: "gzip", body: gzipSync(body) };
  return undefined;
}
