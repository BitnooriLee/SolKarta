"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { computeSunLight } from "@/lib/sun-logic";
import { estimateStoreysFromBuildingProps } from "@/lib/building-storeys";
import { DEFAULT_ANCHOR } from "@/lib/default-anchor";

const STOCKHOLM: [number, number] = [DEFAULT_ANCHOR.lng, DEFAULT_ANCHOR.lat];

/** Web Mercator latitude limit; keeps DEM / fill-extrusion shadow sampling inside valid tile space. */
const MAX_MERCATOR_LAT = 85.05112878;

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

function sanitizeLngLat(lng: number, lat: number): { lng: number; lat: number } {
  if (!isFinite(lng) || !isFinite(lat)) {
    return { lng: STOCKHOLM[0], lat: STOCKHOLM[1] };
  }
  const wrapped =
    ((((lng + 180) % 360) + 360) % 360) - 180;
  const clampedLat = Math.min(MAX_MERCATOR_LAT, Math.max(-MAX_MERCATOR_LAT, lat));
  return { lng: wrapped, lat: clampedLat };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SelectedCoords {
  lng: number;
  lat: number;
}

interface MapViewProps {
  /**
   * Called once the map style has loaded. Receives an `updateSunLight`
   * function that callers can invoke at 60fps without triggering re-renders.
   */
  onMapReady?: (updateSunLight: (date: Date) => void) => void;
  /** When set, the map flies to these coordinates (from search). */
  coords?: SelectedCoords | null;
  /** Fires immediately when a valid map click is detected (before geocoding). */
  onClickStart?: (
    lng: number,
    lat: number,
    estimatedStoreys: number | null
  ) => void;
  /** Fires after reverse-geocoding completes. */
  onMapClick?: (
    lng: number,
    lat: number,
    placeName: string,
    estimatedStoreys: number | null
  ) => void;
  /**
   * Snapped anchor + storey hint without toggling geocode loading state.
   * Used when geocoder coords already match the snapped point but the 3D
   * building metadata must still refresh the analysis card.
   */
  onAnchorUpdate?: (
    lng: number,
    lat: number,
    estimatedStoreys: number | null
  ) => void;
}

// ─── Lighting ─────────────────────────────────────────────────────────────────

function applyMapboxLight(
  map: mapboxgl.Map,
  date: Date,
  location: [number, number] = STOCKHOLM
): void {
  const [lng0, lat0] = location;
  const { lng, lat } = sanitizeLngLat(lng0, lat0);
  let { azimuthal, polar, intensity, lightPreset } = computeSunLight(lat, lng, date);
  if (!isFinite(azimuthal)) azimuthal = 0;
  if (!isFinite(polar)) polar = 45;
  if (!isFinite(intensity)) intensity = 0.5;

  map.setConfigProperty("basemap", "lightPreset", lightPreset);

  // cast-shadows triggers fill-extrusion shadow pass → DEM sampling; GL JS can throw
  // RangeError: out of range source coordinates for DEM data (terrain + Standard 3D buildings).
  // Sun direction / presets still drive the scene; basemap retains its own soft shading.
  (map as unknown as { setLights: (lights: object[]) => void }).setLights([
    {
      id: "ambient-fill",
      type: "ambient",
      properties: {
        color:
          lightPreset === "night" ? "hsl(220,30%,15%)" : "hsl(35,40%,98%)",
        intensity: Math.max(0.05, intensity * 0.4),
      },
    },
    {
      id: "sun-directional",
      type: "directional",
      properties: {
        color: "hsl(38,60%,98%)",
        intensity,
        direction: [azimuthal, polar],
        "cast-shadows": false,
        "shadow-intensity": Math.min(0.95, intensity * 1.1),
      },
    },
  ]);
}

// ─── Marker helpers ───────────────────────────────────────────────────────────

function createMarkerElement(): HTMLElement {
  // Two-element structure: Mapbox controls the OUTER div's transform for
  // geo-positioning; the INNER div handles the bounce animation separately.
  // Without this split, the @keyframes `transform` would override Mapbox's
  // inline `style.transform`, snapping the marker to screen (0,0) / top-left.
  const outer = document.createElement("div");
  outer.className = "solkarta-marker";

  const inner = document.createElement("div");
  inner.className = "solkarta-marker-inner";
  inner.innerHTML = `
    <svg viewBox="0 0 36 46" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Pin body -->
      <path d="M18 0C8.06 0 0 8.06 0 18c0 11.25 18 28 18 28S36 29.25 36 18C36 8.06 27.94 0 18 0z" fill="#E8621A"/>
      <!-- Inner circle -->
      <circle cx="18" cy="18" r="8" fill="white" fill-opacity="0.15"/>
      <!-- Sun core -->
      <circle cx="18" cy="18" r="5.5" fill="white" fill-opacity="0.95"/>
      <!-- Sun rays -->
      <g stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.85">
        <line x1="18" y1="7.5"  x2="18" y2="10"/>
        <line x1="18" y1="26"   x2="18" y2="28.5"/>
        <line x1="7.5" y1="18"  x2="10" y2="18"/>
        <line x1="26"  y1="18"  x2="28.5" y2="18"/>
        <line x1="11"  y1="11"  x2="12.8" y2="12.8"/>
        <line x1="23.2" y1="23.2" x2="25" y2="25"/>
        <line x1="25"  y1="11"  x2="23.2" y2="12.8"/>
        <line x1="12.8" y1="23.2" x2="11" y2="25"/>
      </g>
    </svg>
  `;
  outer.appendChild(inner);
  return outer;
}

/**
 * Moves the marker to [lng, lat], adds it to the map on first call,
 * and triggers the CSS bounce animation on the INNER element.
 *
 * The bounce animation must target the inner div, not the outer one —
 * Mapbox sets `style.transform` on the outer element for geo-positioning,
 * and a @keyframes `transform` applied to the same element would override
 * it, sending the marker to screen (0, 0) during the animation.
 */
function activateMarker(
  map: mapboxgl.Map,
  marker: mapboxgl.Marker,
  addedRef: { current: boolean },
  lng: number,
  lat: number
): void {
  marker.setLngLat([lng, lat]);
  if (!addedRef.current) {
    marker.addTo(map);
    addedRef.current = true;
  }
  // Target the INNER element so the animation doesn't conflict with
  // Mapbox's outer-element transform.
  const inner = marker.getElement().querySelector<HTMLElement>(".solkarta-marker-inner");
  if (inner) {
    inner.classList.remove("marker-bounce");
    void inner.offsetWidth; // force reflow → restarts the animation
    inner.classList.add("marker-bounce");
  }
}

// ─── Reverse geocoding ────────────────────────────────────────────────────────

async function reverseGeocode(lng: number, lat: number): Promise<string> {
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
      `${lng.toFixed(6)},${lat.toFixed(6)}.json` +
      `?access_token=${MAPBOX_TOKEN}` +
      `&language=sv` +
      `&types=address,poi,place` +
      `&limit=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("rev_geocode_fail");
    const data = await res.json();
    return (data.features?.[0]?.place_name as string) ?? "Okänd plats";
  } catch {
    return "Okänd plats";
  }
}

// ─── Building snap ────────────────────────────────────────────────────────────

export type BuildingSnapResult = {
  lng: number;
  lat: number;
  /** Parsed from Mapbox 3D building props; null if no hit or no height/levels data */
  estimatedStoreys: number | null;
};

/**
 * Queries rendered features in a small pixel radius around the click.
 * If a fill-extrusion (3D building) polygon is found, returns its centroid
 * and a storey estimate from tile properties when available.
 */
function snapToBuilding(
  map: mapboxgl.Map,
  clickPoint: mapboxgl.Point,
  fallback: { lng: number; lat: number }
): BuildingSnapResult {
  const pad = 18;
  const bbox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
    [clickPoint.x - pad, clickPoint.y - pad],
    [clickPoint.x + pad, clickPoint.y + pad],
  ];

  const features = map.queryRenderedFeatures(bbox);
  const building = features.find(
    (f) =>
      f.layer?.type === "fill-extrusion" &&
      (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
  );

  if (!building) {
    return { ...fallback, estimatedStoreys: null };
  }

  const geo = building.geometry;
  if (geo.type !== "Polygon" && geo.type !== "MultiPolygon") {
    return { ...fallback, estimatedStoreys: null };
  }

  const ring =
    geo.type === "Polygon"
      ? (geo.coordinates[0] as [number, number][])
      : (geo.coordinates[0][0] as [number, number][]);

  // Guard: an empty ring would produce NaN centroid → marker at screen (0,0)
  if (ring.length === 0) {
    return { ...fallback, estimatedStoreys: null };
  }

  const [sumLng, sumLat] = ring.reduce<[number, number]>(
    ([al, at], [l, t]) => [al + l, at + t],
    [0, 0]
  );

  const centroid = { lng: sumLng / ring.length, lat: sumLat / ring.length };

  // Second guard: NaN from degenerate polygons — fall back to click point
  if (!isFinite(centroid.lng) || !isFinite(centroid.lat)) {
    return { ...fallback, estimatedStoreys: null };
  }

  const estimatedStoreys = estimateStoreysFromBuildingProps(
    building.properties as Record<string, unknown> | null
  );

  return { lng: centroid.lng, lat: centroid.lat, estimatedStoreys };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MapView({
  onMapReady,
  coords,
  onClickStart,
  onMapClick,
  onAnchorUpdate,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const markerAddedRef = useRef(false);

  /** Latest `coords` prop — read inside deferred `idle` handlers (avoids stale closure). */
  const coordsPropRef = useRef<SelectedCoords | null | undefined>(undefined);

  /** Cancels stale `idle` callbacks when `coords` changes in quick succession. */
  const coordsApplyGenRef = useRef(0);

  /** Current map center for location-aware sun calculations. */
  const locationRef = useRef<[number, number]>(STOCKHOLM);

  // Latest callbacks for map/marker handlers (layout phase → always before map init useEffect).
  const onClickStartRef = useRef(onClickStart);
  const onMapClickRef = useRef(onMapClick);
  const onAnchorUpdateRef = useRef(onAnchorUpdate);
  useLayoutEffect(() => {
    onClickStartRef.current = onClickStart;
  }, [onClickStart]);
  useLayoutEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);
  useLayoutEffect(() => {
    onAnchorUpdateRef.current = onAnchorUpdate;
  }, [onAnchorUpdate]);

  // ── Map initialisation (runs once) ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: STOCKHOLM,
      zoom: 14,
      pitch: 55,
      bearing: -20,
      antialias: true,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-right");

    // ── Marker setup ─────────────────────────────────────────────────────────
    const marker = new mapboxgl.Marker({
      element: createMarkerElement(),
      anchor: "bottom",
      draggable: true,
      // Keeps the marker visible even when the pin tip is behind a 3D building
      occludedOpacity: 0.6,
    });
    markerRef.current = marker;

    /**
     * Single pipeline: snap → marker → optional flyTo → parent (AnalysisCard, TopBar).
     * Used for map clicks and marker drag-end so React always tracks the pin.
     */
    const commitPinFromPixel = async (
      pixel: mapboxgl.Point,
      rawLngLat: { lng: number; lat: number },
      flyTo: boolean
    ): Promise<void> => {
      const snapped = snapToBuilding(map, pixel, rawLngLat);
      const safe = sanitizeLngLat(snapped.lng, snapped.lat);
      const { lng, lat } = safe;
      const { estimatedStoreys } = snapped;

      locationRef.current = [lng, lat];
      activateMarker(map, marker, markerAddedRef, lng, lat);

      if (flyTo) {
        map.flyTo({
          center: [lng, lat],
          zoom: 18.5,
          pitch: 60,
          bearing: -20,
          duration: 2000,
          essential: true,
          offset: [0, 80],
          curve: 1.2,
          easing: (t) =>
            t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
        });
      }

      onClickStartRef.current?.(lng, lat, estimatedStoreys);
      let placeName = "Okänd plats";
      try {
        placeName = await reverseGeocode(lng, lat);
      } catch {
        placeName = "Okänd plats";
      }
      onMapClickRef.current?.(lng, lat, placeName, estimatedStoreys);
    };

    // ── Map click (clicks beside the pin; pin uses drag / marker DOM handler) ───
    // Do not gate on a separate mousedown position: on touch / some browsers
    // `mousedown` may not precede `click`, leaving stale (0,0) and blocking
    // `commitPinFromPixel` → BottomPanel never receives new lat/lng. Mapbox
    // already emits `click` only when press+release occur at the same map point.
    map.on("click", (e) => {
      void commitPinFromPixel(e.point, e.lngLat, true);
    });

    // ── Marker drag → same React pipeline as map click (no camera jump) ─────────
    let suppressMarkerClickUntil = 0;
    const onMarkerDragEnd = (): void => {
      suppressMarkerClickUntil = performance.now() + 450;
      const ll = marker.getLngLat();
      const pt = map.project(ll);
      void commitPinFromPixel(pt, ll, false);
    };
    marker.on("dragend", onMarkerDragEnd);

    // ── Tap on pin: map "click" does not fire on the marker DOM (stopPropagation).
    // Browsers often emit a click after dragend — ignore briefly to avoid double commit.
    const onMarkerClick = (ev: MouseEvent): void => {
      ev.stopPropagation();
      if (performance.now() < suppressMarkerClickUntil) return;
      const ll = marker.getLngLat();
      const pt = map.project(ll);
      void commitPinFromPixel(pt, ll, false);
    };
    marker.getElement().addEventListener("click", onMarkerClick);

    map.on("style.load", () => {
      map.setConfigProperty("basemap", "showPointOfInterestLabels", false);
      map.setConfigProperty("basemap", "showTransitLabels", false);

      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
      }
      if (!map.getTerrain()) {
        map.setTerrain({ source: "mapbox-dem", exaggeration: 1 });
      }

      applyMapboxLight(map, new Date(), locationRef.current);

      onMapReady?.((date: Date) => {
        applyMapboxLight(map, date, locationRef.current);
      });
    });

    mapRef.current = map;

    return () => {
      marker.off("dragend", onMarkerDragEnd);
      marker.getElement().removeEventListener("click", onMarkerClick);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      markerAddedRef.current = false;
    };
    // onMapReady intentionally excluded — stable callback ref in parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Coords from search / parent: snap + marker + camera ───────────────────────
  useEffect(() => {
    coordsPropRef.current = coords ?? null;

    if (!coords || !mapRef.current || !markerRef.current) return;

    const { lng: ln0, lat: lt0 } = coords;
    const { lng, lat } = sanitizeLngLat(ln0, lt0);

    const map = mapRef.current;
    const marker = markerRef.current;

    // Map click / drag already moved the marker — skip duplicate flyTo / bounce.
    // Relaxed epsilon: Mapbox getLngLat vs React state can differ slightly in float bits.
    const COORD_EPS = 1e-5;
    if (markerAddedRef.current) {
      const m = marker.getLngLat();
      if (
        Math.abs(m.lng - lng) < COORD_EPS &&
        Math.abs(m.lat - lat) < COORD_EPS
      ) {
        locationRef.current = [lng, lat];
        // Search can clear `estimatedStoreys` while coords match the pin — still
        // re-query 3D tiles so the analysis card gets a fresh storey hint.
        const pt = map.project([lng, lat]);
        const snapped = snapToBuilding(map, pt, { lng, lat });
        onAnchorUpdateRef.current?.(lng, lat, snapped.estimatedStoreys);
        return;
      }
    }

    const gen = ++coordsApplyGenRef.current;

    const applyFromSearch = (): void => {
      if (gen !== coordsApplyGenRef.current) return;
      if (!mapRef.current || !markerRef.current) return;

      const latest = coordsPropRef.current;
      if (!latest) return;

      const raw = sanitizeLngLat(latest.lng, latest.lat);
      const ln = raw.lng;
      const lt = raw.lat;

      const m = mapRef.current;
      const mk = markerRef.current;

      // Same as map-click path: snap to rendered 3D footprint when possible so
      // TopBar address, floor analysis, and pin share one physical anchor.
      const pt = m.project([ln, lt]);
      const snapped = snapToBuilding(m, pt, { lng: ln, lat: lt });
      const safeSnap = sanitizeLngLat(snapped.lng, snapped.lat);
      const useLng = safeSnap.lng;
      const useLat = safeSnap.lat;
      const storeys = snapped.estimatedStoreys;

      const snappedMoved =
        Math.abs(useLng - ln) > COORD_EPS || Math.abs(useLat - lt) > COORD_EPS;

      if (!snappedMoved) {
        onAnchorUpdateRef.current?.(useLng, useLat, storeys);
      } else {
        onClickStartRef.current?.(useLng, useLat, storeys);
        void (async () => {
          let placeName = "Okänd plats";
          try {
            placeName = await reverseGeocode(useLng, useLat);
          } catch {
            placeName = "Okänd plats";
          }
          onMapClickRef.current?.(useLng, useLat, placeName, storeys);
        })();
      }

      locationRef.current = [useLng, useLat];

      mk.setLngLat([useLng, useLat]);
      if (!markerAddedRef.current) {
        mk.addTo(m);
        markerAddedRef.current = true;
      }
      const inner = mk
        .getElement()
        .querySelector<HTMLElement>(".solkarta-marker-inner");
      if (inner) {
        inner.classList.remove("marker-bounce");
        void inner.offsetWidth;
        inner.classList.add("marker-bounce");
      }

      m.flyTo({
        center: [useLng, useLat],
        zoom: 18.5,
        pitch: 60,
        bearing: -20,
        duration: 2000,
        essential: true,
        offset: [0, 80],
        curve: 1.2,
        easing: (t) =>
          t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
      });
    };

    let cancelled = false;

    const onIdle = (): void => {
      if (cancelled || gen !== coordsApplyGenRef.current) return;
      applyFromSearch();
    };

    if (map.isStyleLoaded()) {
      applyFromSearch();
      return () => {
        cancelled = true;
      };
    }

    map.once("idle", onIdle);
    return () => {
      cancelled = true;
      map.off("idle", onIdle);
    };
  }, [coords]);

  // ── Error state ──────────────────────────────────────────────────────────────
  if (!MAPBOX_TOKEN) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-surface">
        <div className="max-w-sm text-center p-6 rounded-2xl border border-black/[0.08] bg-panel shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-accent-light flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🗝️</span>
          </div>
          <p className="text-sm font-semibold text-ink mb-1">
            Mapbox-token saknas
          </p>
          <p className="text-xs text-muted leading-relaxed">
            Skapa en{" "}
            <code className="bg-surface px-1 py-0.5 rounded font-mono">
              .env.local
            </code>{" "}
            fil i projektroten och lägg till
            <br />
            <code className="bg-surface px-1 py-0.5 rounded font-mono">
              NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxx
            </code>
          </p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
