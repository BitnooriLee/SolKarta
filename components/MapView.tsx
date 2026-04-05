"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { computeSunLight } from "@/lib/sun-logic";
import { estimateStoreysFromBuildingProps } from "@/lib/building-storeys";

// Stockholm city center — fallback when no address is selected
const STOCKHOLM: [number, number] = [18.0686, 59.3293]; // [lng, lat]

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

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
  const { azimuthal, polar, intensity, lightPreset } = computeSunLight(
    location[1],
    location[0],
    date
  );

  map.setConfigProperty("basemap", "lightPreset", lightPreset);

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
        "cast-shadows": true,
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

  // Stable callback refs — avoids stale-closure problems inside map event handlers
  const onClickStartRef = useRef(onClickStart);
  const onMapClickRef = useRef(onMapClick);
  const onAnchorUpdateRef = useRef(onAnchorUpdate);
  useEffect(() => { onClickStartRef.current = onClickStart; }, [onClickStart]);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onAnchorUpdateRef.current = onAnchorUpdate; }, [onAnchorUpdate]);

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
      const { lng, lat, estimatedStoreys } = snapped;

      if (!isFinite(lng) || !isFinite(lat)) return;

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
      const placeName = await reverseGeocode(lng, lat);
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
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.3 });

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

    const { lng, lat } = coords;

    // Guard: degenerate coords would silently pin the marker at screen (0,0)
    if (!isFinite(lng) || !isFinite(lat)) return;

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
        return;
      }
    }

    const gen = ++coordsApplyGenRef.current;

    const applyFromSearch = (): void => {
      if (gen !== coordsApplyGenRef.current) return;
      if (!mapRef.current || !markerRef.current) return;

      const latest = coordsPropRef.current;
      if (!latest) return;

      const ln = latest.lng;
      const lt = latest.lat;
      if (!isFinite(ln) || !isFinite(lt)) return;

      const m = mapRef.current;
      const mk = markerRef.current;

      // Same as map-click path: snap to rendered 3D footprint when possible so
      // TopBar address, floor analysis, and pin share one physical anchor.
      const pt = m.project([ln, lt]);
      const snapped = snapToBuilding(m, pt, { lng: ln, lat: lt });
      const useLng = snapped.lng;
      const useLat = snapped.lat;
      const storeys = snapped.estimatedStoreys;

      const snappedMoved =
        Math.abs(useLng - ln) > COORD_EPS || Math.abs(useLat - lt) > COORD_EPS;

      if (!snappedMoved) {
        onAnchorUpdateRef.current?.(useLng, useLat, storeys);
      } else {
        onClickStartRef.current?.(useLng, useLat, storeys);
        void reverseGeocode(useLng, useLat).then((placeName) => {
          onMapClickRef.current?.(useLng, useLat, placeName, storeys);
        });
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
