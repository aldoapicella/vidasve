import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

export function base64Url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function randomBase64Url(bytes = 24): string {
  return base64Url(randomBytes(bytes));
}

export function hmacHex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function hmacBase64Url(secret: string, value: string): string {
  return base64Url(createHmac("sha256", secret).update(value).digest());
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function hashSecret(secret: string, value: string): string {
  return hmacHex(secret, value);
}

function keyFromSecret(secret: string): Buffer {
  const maybeBase64 = Buffer.from(secret, "base64");
  if (maybeBase64.length === 32) return maybeBase64;
  return createHmac("sha256", "maparescate-pii").update(secret).digest();
}

export function encryptText(secret: string, text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [base64Url(iv), base64Url(tag), base64Url(encrypted)].join(".");
}

export function decryptText(secret: string, encoded: string): string {
  const [ivPart, tagPart, dataPart] = encoded.split(".");
  if (!ivPart || !tagPart || !dataPart) throw new Error("Invalid encrypted text");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyFromSecret(secret),
    Buffer.from(ivPart.replace(/-/g, "+").replace(/_/g, "/"), "base64")
  );
  decipher.setAuthTag(Buffer.from(tagPart.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart.replace(/-/g, "+").replace(/_/g, "/"), "base64")),
    decipher.final()
  ]).toString("utf8");
}

export function verifyHmacToken(secret: string, token: string, hash: string): boolean {
  return safeEqual(hashSecret(secret, token), hash);
}
