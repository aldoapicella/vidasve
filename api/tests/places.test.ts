import assert from "node:assert/strict";
import test from "node:test";
import { mapAzurePlaces } from "../src/lib/places.js";

test("mapAzurePlaces returns only suggestions inside allowed zones", () => {
  const items = mapAzurePlaces([
    {
      id: "inside",
      poi: { name: "Plaza Altamira" },
      address: { freeformAddress: "Plaza Altamira, Caracas", municipality: "Caracas" },
      position: { lat: 10.5, lon: -66.85 }
    },
    {
      id: "outside",
      address: { freeformAddress: "Maracaibo" },
      position: { lat: 10.65, lon: -71.63 }
    }
  ], [{ name: "Caracas", minLng: -67.24, minLat: 10.34, maxLng: -66.72, maxLat: 10.62 }]);

  assert.equal(items.length, 1);
  assert.equal(items[0].label, "Plaza Altamira");
  assert.deepEqual(items[0].coordinates, [-66.85, 10.5]);
});
