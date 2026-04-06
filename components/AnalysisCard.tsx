"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Lock, Sun, ChevronUp, ChevronDown, MapPin, Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { analyzeAllFloors, type FloorAnalysis } from "@/lib/floor-analysis";
import { gradeToColor, gradeToSwedishLabel } from "@/lib/scoring";

// Without a map storey hint, show enough floors that upper levels can differ (inner city: vån 1–4 often 0 h winter direct sun in the model).
const DEFAULT_TOTAL_FLOORS = 8;
const MAX_UI_FLOORS = 20;
/** Fixed chart slot — must match `initialDimension` height for Recharts. */
const BAR_CHART_H_PX = 56;

interface AnalysisCardProps {
  lat: number;
  lng: number;
  buildingStoreysHint?: number | null;
  loading?: boolean;
}

function formatWinterHours(hours: number): string {
  if (hours < 0.05) return "ingen sol";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} t`;
  return `${h} t ${m} min`;
}

export default function AnalysisCard({
  lat,
  lng,
  buildingStoreysHint = null,
  loading,
}: AnalysisCardProps) {
  const loggedCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    const prev = loggedCoordsRef.current;
    if (prev && prev.lat === lat && prev.lng === lng) return;
    loggedCoordsRef.current = { lat, lng };
    console.log("Rendering Card:", lat, lng);
  }, [lat, lng]);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [floor, setFloor] = useState(1);
  const [totalFloors, setTotalFloors] = useState(DEFAULT_TOTAL_FLOORS);

  const coordsReady =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  const [allFloors, setAllFloors] = useState<FloorAnalysis[]>([]);

  // Derive `nextTotal` here and set `allFloors` in the same effect so a second effect
  // cannot run with stale `totalFloors` and overwrite analysis.
  useEffect(() => {
    setFloor(1);
    const nextTotal =
      buildingStoreysHint != null &&
      Number.isFinite(buildingStoreysHint) &&
      buildingStoreysHint >= 1
        ? Math.min(MAX_UI_FLOORS, Math.max(1, Math.round(buildingStoreysHint)))
        : DEFAULT_TOTAL_FLOORS;
    setTotalFloors(nextTotal);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      setAllFloors([]);
      return;
    }
    const year = new Date().getFullYear();
    setAllFloors(analyzeAllFloors(lat, lng, Math.max(nextTotal, 1), year));
  }, [lat, lng, buildingStoreysHint]);

  const chartData = useMemo(
    () =>
      allFloors.map((f) => ({
        floor: f.floor,
        hours: parseFloat(f.winter_sun_hours.toFixed(2)),
        grade: f.grade,
      })),
    [allFloors]
  );

  const isInvalidFloor = floor < 1 || floor > totalFloors;
  const analysis = isInvalidFloor ? null : allFloors[floor - 1];

  const winterText = analysis ? formatWinterHours(analysis.winter_sun_hours) : "—";
  const gradeColor = gradeToColor(analysis?.grade ?? "F");
  const gradeLabel = gradeToSwedishLabel(analysis?.grade ?? "F");

  const chartReady =
    !loading && coordsReady && chartData.length > 0;

  const handleTotalChange = (delta: number) => {
    const next = Math.min(MAX_UI_FLOORS, Math.max(1, totalFloors + delta));
    setTotalFloors(next);
    if (floor > next) setFloor(next);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      const year = new Date().getFullYear();
      setAllFloors(analyzeAllFloors(lat, lng, Math.max(next, 1), year));
    }
  };

  // --- 이하 렌더링 로직 (기존과 동일) ---
  return (
    <div className="w-52 min-w-0 shrink-0 px-3 pt-2.5 pb-2 flex flex-col gap-2 border-l border-black/[0.05] overflow-hidden relative">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 min-w-0">
          <Sun size={10} className="text-accent shrink-0" />
          <span className="text-[9px] font-semibold text-muted uppercase tracking-[0.12em] truncate">
            Direct sol på våning
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-0.5 border border-black/[0.08] rounded-md px-1.5 py-0.5 bg-surface">
            <span className="text-[8px] text-muted leading-none mr-0.5">Totalt</span>
            <button onClick={() => handleTotalChange(-1)} className="text-muted hover:text-ink"><ChevronDown size={10} /></button>
            <span className="text-[10px] font-bold text-ink w-4 text-center">{totalFloors}</span>
            <button onClick={() => handleTotalChange(1)} className="text-muted hover:text-ink"><ChevronUp size={10} /></button>
          </div>
          <span className="text-[7px] text-muted/80 leading-none text-right">
            {buildingStoreysHint != null ? "Våningar från karta" : "Standard — justera vid behov"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-[3px]">
        {Array.from({ length: Math.min(totalFloors, 10) }, (_, i) => i + 1).map((f) => (
          <button
            key={f}
            onClick={() => setFloor(f)}
            className={`w-[20px] h-[20px] text-[10px] font-bold rounded-[4px] ${
              floor === f ? "bg-accent text-white shadow-sm scale-110" : "bg-black/[0.05] text-muted"
            }`}
          >
            {f}
          </button>
        ))}
        {totalFloors > 10 && <span className="text-[9px] text-muted self-center ml-0.5">+{totalFloors - 10}</span>}
      </div>

      <div className="flex items-center gap-1 -mt-1">
        <MapPin size={8} className="text-muted/60 shrink-0" />
        <span className="text-[8px] text-muted/70 tabular-nums truncate font-mono">
          {lat.toFixed(4)}, {lng.toFixed(4)}
        </span>
      </div>

      {isInvalidFloor ? (
        <p className="text-[10px] font-semibold text-red-500">Ogiltig våning — välj 1–{totalFloors}</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg font-black text-[15px] text-white shrink-0" style={{ background: gradeColor }}>
              {analysis?.grade}
            </div>
            <div className="flex flex-col min-w-0 leading-tight">
              <span className="text-[9px] font-medium text-muted truncate">{gradeLabel}</span>
              <span className="text-[12px] font-bold text-ink">{winterText}</span>
              <span className="text-[9px] text-muted">vinter-sol</span>
            </div>
          </div>
          <p className="text-[9.5px] text-muted leading-snug">
            <span className="font-semibold text-ink/80">Vinter-check (Vån. {floor}):</span>{" "}
            {(analysis?.winter_sun_hours ?? 0) < 0.05 ? `Får ingen direkt sol.` : `Ser solen i ${winterText}.`}
          </p>
        </>
      )}

      <div
        className="relative rounded-lg overflow-hidden border border-black/[0.07] bg-surface mt-auto"
        style={{ minHeight: BAR_CHART_H_PX }}
      >
        <div
          className="w-full min-w-0 shrink-0 overflow-hidden"
          style={{
            width: "100%",
            height: BAR_CHART_H_PX,
            minHeight: BAR_CHART_H_PX,
          }}
        >
          <div
            className="h-full w-full min-h-0 min-w-0 blur-sm pointer-events-none"
            style={{
              width: "100%",
              height: BAR_CHART_H_PX,
              minHeight: BAR_CHART_H_PX,
            }}
          >
            {!isMounted ? (
              <div
                className="w-full bg-black/[0.03]"
                style={{ height: BAR_CHART_H_PX, minHeight: BAR_CHART_H_PX }}
                aria-hidden
              />
            ) : chartReady ? (
              <ResponsiveContainer
                key={`rc-${lat}-${lng}-${totalFloors}`}
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={0}
                initialDimension={{ width: 208, height: BAR_CHART_H_PX }}
              >
                <BarChart
                  key={`bc-${lat}-${lng}-${totalFloors}`}
                  data={chartData}
                  margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
                >
                  <XAxis dataKey="floor" hide />
                  <YAxis hide domain={[0, 8]} />
                  <Bar dataKey="hours" radius={[2, 2, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={gradeToColor(entry.grade)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div
                className="h-full w-full min-h-0 bg-black/[0.03]"
                style={{ height: BAR_CHART_H_PX, minHeight: BAR_CHART_H_PX }}
                aria-hidden
              />
            )}
          </div>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/75 backdrop-blur-[1px]">
          <button
            className="px-3 py-1.5 rounded-lg text-white text-[10px] font-bold shadow-md hover:scale-105"
            style={{ background: "linear-gradient(135deg, #E8621A 0%, #F59E0B 100%)" }}
          >
            <Lock size={9} strokeWidth={2.5} className="inline mr-1" />
            Lås upp
          </button>
          <span className="text-[8px] text-muted/90 text-center">Jämför alla {totalFloors} våningar</span>
        </div>
      </div>

      {loading && (
        <div className="absolute top-0 left-0 right-0 flex items-center gap-1 px-2 py-[3px] bg-accent/10 border-b border-accent/20 z-10">
          <Loader2 size={9} className="text-accent animate-spin" />
          <span className="text-[8px] font-semibold text-accent">Laddar adress…</span>
        </div>
      )}
    </div>
  );
}