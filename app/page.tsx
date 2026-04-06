"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import TopBar from "@/components/TopBar";
import BottomPanel from "@/components/BottomPanel";
import { DEFAULT_ANCHOR } from "@/lib/default-anchor";

// MapView requires `window` (Mapbox GL) — disable SSR
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3 text-muted">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium tracking-wide">Laddar karta…</span>
      </div>
    </div>
  ),
});

type MapAnchor = {
  lat: number;
  lng: number;
  /** Bumps on every user-driven anchor commit so React remounts analysis when lng/lat are unchanged (e.g. snap-to-building). */
  lastUpdated: number;
};

export default function HomePage() {
  const [sunDate, setSunDate] = useState<Date>(() => new Date());
  const [anchor, setAnchor] = useState<MapAnchor>(() => ({
    lat: DEFAULT_ANCHOR.lat,
    lng: DEFAULT_ANCHOR.lng,
    lastUpdated: Date.now(),
  }));

  /**
   * Address that came from a map click (reverse-geocoded).
   * `null` = no map click yet; string = syncs TopBar search field.
   * Intentionally NOT set by TopBar selections to avoid circular updates.
   */
  const [mapClickAddress, setMapClickAddress] = useState<string | null>(null);

  /** True while reverse-geocoding is in progress after a map click. */
  const [isLocating, setIsLocating] = useState(false);

  /**
   * Storey count inferred from Mapbox 3D building tiles at the snapped pin.
   * `null` = no building hit or no height/levels in tile data (use card default).
   */
  const [estimatedStoreys, setEstimatedStoreys] = useState<number | null>(null);

  // Stable ref to the map's light-update function — avoids prop-drilling re-renders
  const updateMapLightRef = useRef<((date: Date) => void) | null>(null);

  // Called once by MapView after style.load — registers the updater
  const handleMapReady = useCallback((updater: (date: Date) => void) => {
    updateMapLightRef.current = updater;
    updater(sunDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty deps: fires once at mount

  // Called by TimeSlider on every slider tick (60fps via RAF)
  const handleDateChange = useCallback((date: Date) => {
    setSunDate(date);
    updateMapLightRef.current?.(date);
  }, []);

  const applyAnchorCoords = useCallback((lng: number, lat: number) => {
    setAnchor({
      lng,
      lat,
      lastUpdated: Date.now(),
    });
  }, []);

  /** Stable coords for MapView — only change when lng/lat change, not when `lastUpdated` bumps alone. */
  const mapViewCoords = useMemo(
    () => ({ lng: anchor.lng, lat: anchor.lat }),
    [anchor.lng, anchor.lat]
  );

  // Called by TopBar when the user selects a geocoded result.
  // placeName is captured here so that a TopBar search also updates the
  // mapClickAddress — keeping it in sync with the address bar on first load.
  const handleAddressSelect = useCallback(
    (lng: number, lat: number, placeName?: string) => {
      setIsLocating(false);
      applyAnchorCoords(lng, lat);
      setEstimatedStoreys(null);
      if (placeName) setMapClickAddress(placeName);
    },
    [applyAnchorCoords]
  );

  /** Stable: only depends on applyAnchorCoords ([]), so MapView ref slots stop churning every render. */
  const handleAnchorFromMap = useCallback(
    (lng: number, lat: number, storeys: number | null) => {
      applyAnchorCoords(lng, lat);
      setEstimatedStoreys((prev) => (prev === storeys ? prev : storeys));
    },
    [applyAnchorCoords]
  );

  // Fires immediately on a valid map click / pin commit (before geocoding finishes)
  const handleClickStart = useCallback(
    (lng: number, lat: number, storeys: number | null) => {
      handleAnchorFromMap(lng, lat, storeys);
      setIsLocating(true);
    },
    [handleAnchorFromMap]
  );

  // Fires after reverse-geocoding completes
  const handleMapClick = useCallback(
    (lng: number, lat: number, placeName: string, storeys: number | null) => {
      setIsLocating(false);
      handleAnchorFromMap(lng, lat, storeys);
      setMapClickAddress(placeName);
    },
    [handleAnchorFromMap]
  );

  // Re-apply map sun-light when the analysis location changes (slider uses the ref updater).
  useEffect(() => {
    updateMapLightRef.current?.(sunDate);
  }, [anchor.lng, anchor.lat, sunDate]);

  return (
    <main className="flex flex-col h-dvh overflow-hidden">
      {/* Zone 1: TopBar — h-16 fixed */}
      <TopBar onSelect={handleAddressSelect} externalAddress={mapClickAddress} />

      {/* Zone 2: MapView — fills remaining space */}
      <div className="flex-1 min-h-0 relative">
        <MapView
          onMapReady={handleMapReady}
          coords={mapViewCoords}
          onClickStart={handleClickStart}
          onMapClick={handleMapClick}
          onAnchorUpdate={handleAnchorFromMap}
        />
      </div>

      {/* Zone 3: BottomPanel — time slider + season switcher + floor analysis */}
      <BottomPanel
        key={`bp-${anchor.lat.toFixed(6)}-${anchor.lng.toFixed(6)}-${anchor.lastUpdated}`}
        analysisCardKey={`${anchor.lat}-${anchor.lng}`}
        sunDate={sunDate}
        onDateChange={handleDateChange}
        lat={anchor.lat}
        lng={anchor.lng}
        buildingStoreysHint={estimatedStoreys}
        locating={isLocating}
      />
    </main>
  );
}
