import { env } from "./config.js";
import type { CreateReportInput } from "./types.js";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function validateCaptcha(input: Pick<CreateReportInput, "captchaText" | "captchaToken">): Promise<string | null> {
  const secret = env("TURNSTILE_SECRET_KEY");
  if (!secret) return input.captchaText?.trim().toUpperCase() === "VIDA" ? null : "captcha_failed";

  const token = input.captchaToken?.trim();
  if (!token) return "captcha_failed";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
      signal: controller.signal
    });
    const result = (await response.json().catch(() => ({}))) as { success?: boolean };
    return response.ok && result.success ? null : "captcha_failed";
  } catch {
    return "captcha_failed";
  } finally {
    clearTimeout(timeout);
  }
}
