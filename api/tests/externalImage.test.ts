import assert from "node:assert/strict";
import test from "node:test";
import { safeExternalImageUrl } from "../src/functions/externalImage.js";

test("safeExternalImageUrl only allows known public photo hosts", () => {
  assert.equal(
    safeExternalImageUrl("https://venezuelatebusca.com/media/photos/example.webp"),
    "https://venezuelatebusca.com/media/photos/example.webp"
  );
  assert.equal(
    safeExternalImageUrl("https://wlvcfbuxkdrxhxqlwwmo.supabase.co/storage/v1/object/public/photos/example.jpg"),
    "https://wlvcfbuxkdrxhxqlwwmo.supabase.co/storage/v1/object/public/photos/example.jpg"
  );
  assert.equal(safeExternalImageUrl("http://venezuelatebusca.com/media/photos/example.webp"), undefined);
  assert.equal(safeExternalImageUrl("https://example.com/example.webp"), undefined);
  assert.equal(safeExternalImageUrl("not a url"), undefined);
});
