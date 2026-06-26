import assert from "node:assert/strict";
import test from "node:test";
import { parsePublicPost } from "../src/lib/validation.js";

test("parsePublicPost sanitizes text, type and tags", () => {
  const post = parsePublicPost({
    text: "<b>Ana</b> vista en piso 4",
    postType: "admin_only",
    tags: ["familia", "<script>", "senales"]
  });

  assert.equal(post.text, "bAna/b vista en piso 4");
  assert.equal(post.postType, "story");
  assert.deepEqual(post.tags, ["familia", "script", "senales"]);
});
