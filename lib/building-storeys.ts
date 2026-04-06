import { FLOOR_HEIGHT_M as ANALYSIS_FLOOR_HEIGHT_M } from "@/lib/floor-analysis";

/**
 * Average storey height in meters, including slab thickness.
 * Used for estimating storey count from a building's total height when
 * explicit `building:levels` data is unavailable from Mapbox/OSM.
 * 3.5m is a generous heuristic for modern Swedish residential buildings
 * (e.g., 2.7m ceiling + 0.3m slab + buffer).
 */
const ESTIMATED_STOREY_HEIGHT_M = 3.5;

const MAX_REASONABLE_STOREYS = 60;

/**
 * Ordered keys for "total levels in the building" style attributes from
 * Mapbox / OSM / composite tilesets. Earlier keys win.
 *
 * Note: `flr_no` is intentionally omitted — in many datasets it is the
 * apartment's floor index, not the building's total storey count.
 */
const STOREY_LEVEL_KEYS: readonly string[] = [
  // Primary, most reliable tags
  "building:levels",
  "levels",
  "building_levels",

  // Common synonyms
  "total_floors",
  "total_levels",
  "num_floors",
  "number_of_floors",
  "floor_count",
  "floors",
  "building_floors",
  "storey_count",
  "storeys",
  "n_floors",

  // Lower confidence - might be apartment floor, not building total
  "flr_no",
];

const HEIGHT_KEYS: readonly string[] = [
  "height",
  "render_height",
  "building_height",
  "extrude",
  "shape_h",
  "rel_height",
];

/**
 * Parse Mapbox / OSM-style building properties into an integer storey count.
 * Returns null when no reliable signal exists (open ground, missing height data).
 */
export function estimateStoreysFromBuildingProps(
  props: Record<string, unknown> | null | undefined
): number | null {
  if (!props || typeof props !== "object") return null;
  const p = props;

  const parseNum = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const trimmed = v.replace(/,/g, ".").replace(/m\b/gi, "").trim();
      const n = parseFloat(trimmed);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  let levels: number | null = null;
  for (const key of STOREY_LEVEL_KEYS) {
    const v = parseNum(p[key]);
    if (v != null && v >= 1) {
      levels = v;
      break;
    }
  }

  if (levels != null) {
    return Math.min(MAX_REASONABLE_STOREYS, Math.max(1, Math.round(levels)));
  }

  let heightM: number | null = null;
  for (const key of HEIGHT_KEYS) {
    const v = parseNum(p[key]);
    if (v != null && v > 0) {
      heightM = v;
      break;
    }
  }

  if (heightM != null && heightM >= ANALYSIS_FLOOR_HEIGHT_M * 0.75) {
    return Math.min(
      MAX_REASONABLE_STOREYS,
      Math.max(1, Math.round(heightM / ESTIMATED_STOREY_HEIGHT_M))
    );
  }

  return null;
}
