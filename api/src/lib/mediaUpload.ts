const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export function validateMediaUpload(input: { size: number; type: string }): string | null {
  if (!Number.isFinite(input.size) || input.size <= 0) return "empty_file";
  if (input.size > MAX_MEDIA_BYTES) return "file_too_large";
  if (!ALLOWED_MEDIA_TYPES.has(input.type.toLowerCase())) return "unsupported_file_type";
  return null;
}
