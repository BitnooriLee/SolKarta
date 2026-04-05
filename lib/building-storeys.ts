import { FLOOR_HEIGHT_M } from "@/lib/floor-analysis";

const MAX_REASONABLE_STOREYS = 60;

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
      const n = parseFloat(v.replace(/,/g, "."));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const levels =
    parseNum(p["building:levels"]) ??
    parseNum(p.levels) ??
    parseNum(p.building_levels) ??
    parseNum(p.floor_count);
  if (levels != null && levels >= 1) {
    return Math.min(MAX_REASONABLE_STOREYS, Math.max(1, Math.round(levels)));
  }

  const heightM =
    parseNum(p.height) ??
    parseNum(p.render_height) ??
    parseNum(p.building_height) ??
    parseNum(p.extrude);
  if (heightM != null && heightM >= FLOOR_HEIGHT_M * 0.75) {
    return Math.min(
      MAX_REASONABLE_STOREYS,
      Math.max(1, Math.round(heightM / FLOOR_HEIGHT_M))
    );
  }

  return null;
}
