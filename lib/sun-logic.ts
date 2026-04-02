import SunCalc from "suncalc";

export type LightPreset = "dawn" | "day" | "dusk" | "night";

export interface SunLightConfig {
  /** Mapbox directional light azimuthal angle (degrees, north=0 clockwise) */
  azimuthal: number;
  /** Mapbox directional light polar angle (degrees, 0=zenith, 90=horizon) */
  polar: number;
  /** Sun altitude above horizon in degrees */
  altitudeDeg: number;
  /** Directional light intensity 0–1 */
  intensity: number;
  /** Closest Standard-style preset for scene coloring */
  lightPreset: LightPreset;
}

/**
 * Converts a geographic position + datetime into Mapbox v3 DirectionalLight
 * parameters suitable for `map.setLights(...)`.
 *
 * SunCalc azimuth convention: 0 = south, positive toward west (radians).
 * Mapbox azimuthal convention: 0 = north, positive clockwise (degrees).
 * Conversion: mapbox_azimuthal = (suncalc_azimuth_rad × 180/π + 180) % 360
 */
export function computeSunLight(
  lat: number,
  lng: number,
  date: Date
): SunLightConfig {
  const pos = SunCalc.getPosition(date, lat, lng);

  const altitudeDeg = pos.altitude * (180 / Math.PI);

  // South-based → north-based clockwise
  const azimuthal = ((pos.azimuth * (180 / Math.PI)) + 180 + 360) % 360;

  // Clamp polar so the light never goes fully underground (prevents artifacts)
  const polar = Math.max(5, Math.min(90, 90 - altitudeDeg));

  let lightPreset: LightPreset;
  let intensity: number;

  if (altitudeDeg < -6) {
    lightPreset = "night";
    intensity = 0;
  } else if (altitudeDeg < 0) {
    // Civil twilight: fade in
    lightPreset = "dusk";
    intensity = ((altitudeDeg + 6) / 6) * 0.25;
  } else if (altitudeDeg < 8) {
    // Golden hour
    lightPreset = altitudeDeg < 4 ? "dawn" : "day";
    intensity = 0.25 + (altitudeDeg / 8) * 0.45;
  } else {
    lightPreset = "day";
    // Swedish winter sun stays low; cap intensity at a realistic ceiling
    intensity = Math.min(0.95, 0.7 + (altitudeDeg / 90) * 0.25);
  }

  return { azimuthal, polar, altitudeDeg, intensity, lightPreset };
}

/**
 * Returns SunCalc times (sunrise, sunset, etc.) for a given location and date.
 * Useful for the sun-altitude graph in Step 2.
 */
export function getSunTimes(lat: number, lng: number, date: Date) {
  return SunCalc.getTimes(date, lat, lng);
}

/**
 * Generates an array of { minutes, altitudeDeg } samples across a full day.
 * Used to draw the sun-altitude curve in BottomPanel.
 */
export function buildDayCurve(
  lat: number,
  lng: number,
  date: Date,
  samples = 144 // every 10 minutes
): { minutes: number; altitudeDeg: number }[] {
  const base = new Date(date);
  base.setHours(0, 0, 0, 0);

  return Array.from({ length: samples }, (_, i) => {
    const minutes = Math.round((i / (samples - 1)) * 1439);
    const d = new Date(base.getTime() + minutes * 60_000);
    const pos = SunCalc.getPosition(d, lat, lng);
    return { minutes, altitudeDeg: pos.altitude * (180 / Math.PI) };
  });
}
