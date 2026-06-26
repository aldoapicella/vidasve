import type { AllowedBbox } from "./types.js";
import { pointInAllowedBboxes } from "./geo.js";

export interface PlaceSuggestion {
  id: string;
  label: string;
  detail?: string;
  coordinates: [number, number];
}

interface AzureSearchResult {
  id?: string;
  type?: string;
  poi?: { name?: string };
  address?: {
    freeformAddress?: string;
    municipality?: string;
    countrySubdivision?: string;
  };
  position?: { lat?: number; lon?: number };
}

export function mapAzurePlaces(results: AzureSearchResult[], allowedBboxes: AllowedBbox[]): PlaceSuggestion[] {
  return results
    .map((result, index) => {
      const lat = Number(result.position?.lat);
      const lon = Number(result.position?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
      const coordinates: [number, number] = [lon, lat];
      if (!pointInAllowedBboxes({ type: "Point", coordinates }, allowedBboxes)) return undefined;
      const label = result.poi?.name || result.address?.freeformAddress;
      if (!label) return undefined;
      return {
        id: result.id ?? `${lon}:${lat}:${index}`,
        label,
        detail: [result.address?.municipality, result.address?.countrySubdivision, result.type].filter(Boolean).join(" · "),
        coordinates
      };
    })
    .filter(Boolean)
    .slice(0, 6) as PlaceSuggestion[];
}
