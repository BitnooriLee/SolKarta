"use client";

import { useState, useMemo, useEffect } from "react";
import { Lock, Sun, ChevronUp, ChevronDown, MapPin, Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { analyzeAllFloors } from "@/lib/floor-analysis";
import { gradeToColor, gradeToSwedishLabel } from "@/lib/scoring";

const DEFAULT_TOTAL_FLOORS = 4;
const MAX_UI_FLOORS = 20;

interface AnalysisCardProps {
  lat?: number;
  lng?: number;
  /** Parsed from Mapbox 3D buildings at the pin; null = use default total */
  buildingStoreysHint?: number | null;
  /** True while a map-click reverse-geocoding request is in flight. */
  loading?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatWinterHours(hours: number): string {
  if (hours < 0.05) return "ingen sol";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} t`;
  return `${h} t ${m} min`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AnalysisCard({
  lat = 59.333,
  lng = 18.067,
  buildingStoreysHint = null,
  loading,
}: AnalysisCardProps) {
  const [floor, setFloor] = useState(1);
  const [totalFloors, setTotalFloors] = useState(DEFAULT_TOTAL_FLOORS);

  const year = useMemo(() => new Date().getFullYear(), []);

  // Keep floor picker aligned with the map anchor: new coords or a new Mapbox
  // storey hint resets to våning 1 and rescopes the stepper range.
  useEffect(() => {
    setFloor(1);
    const nextTotal =
      buildingStoreysHint != null &&
      Number.isFinite(buildingStoreysHint) &&
      buildingStoreysHint >= 1
        ? Math.min(MAX_UI_FLOORS, Math.max(1, Math.round(buildingStoreysHint)))
        : DEFAULT_TOTAL_FLOORS;
    setTotalFloors(nextTotal);
  }, [lat, lng, buildingStoreysHint]);

  // Compute all floors once per location/totalFloors change.
  // 10 floors × 144 SunCalc samples × 2 solstices ≈ 2 ms — no loading state needed.
  const allFloors = useMemo(
    () => analyzeAllFloors(lat, lng, Math.max(totalFloors, 1), year),
    [lat, lng, totalFloors, year]
  );

  const isInvalidFloor = floor < 1 || floor > totalFloors;
  const analysis = isInvalidFloor ? null : allFloors[floor - 1];

  const winterText = analysis ? formatWinterHours(analysis.winter_sun_hours) : "—";
  const gradeColor = gradeToColor(analysis?.grade ?? "F");
  const gradeLabel = gradeToSwedishLabel(analysis?.grade ?? "F");

  // Chart data: all floors, shown blurred as premium preview
  const chartData = allFloors.map((f) => ({
    floor: f.floor,
    hours: parseFloat(f.winter_sun_hours.toFixed(2)),
    grade: f.grade,
  }));

  const handleTotalChange = (delta: number) => {
    const next = Math.min(MAX_UI_FLOORS, Math.max(1, totalFloors + delta));
    setTotalFloors(next);
    if (floor > next) setFloor(next);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="w-52 shrink-0 px-3 pt-2.5 pb-2 flex flex-col gap-2 border-l border-black/[0.05] overflow-hidden relative">

      {/* ── Header: "Välj våning" + total-floor stepper ──────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 min-w-0">
          <Sun size={10} className="text-accent shrink-0" />
          <span className="text-[9px] font-semibold text-muted uppercase tracking-[0.12em] truncate">
            Direct sol på våning
          </span>
        </div>
        {/* Total floors stepper */}
        <div className="flex flex-col items-end gap-0.5">
        <div className="flex items-center gap-0.5 border border-black/[0.08] rounded-md px-1.5 py-0.5 bg-surface">
          <span className="text-[8px] text-muted leading-none mr-0.5">Totalt</span>
          <button
            onClick={() => handleTotalChange(-1)}
            className="text-muted hover:text-ink transition-colors"
            aria-label="Minska totalt antal våningar"
          >
            <ChevronDown size={10} strokeWidth={2.5} />
          </button>
          <span className="text-[10px] font-bold text-ink tabular-nums w-4 text-center leading-none">
            {totalFloors}
          </span>
          <button
            onClick={() => handleTotalChange(1)}
            className="text-muted hover:text-ink transition-colors"
            aria-label="Öka totalt antal våningar"
          >
            <ChevronUp size={10} strokeWidth={2.5} />
          </button>
        </div>
        {buildingStoreysHint != null ? (
          <span className="text-[7px] text-muted/80 leading-none max-w-[5.5rem] text-right">
            Våningar från karta
          </span>
        ) : (
          <span className="text-[7px] text-muted/80 leading-none max-w-[5.5rem] text-right">
            Standard — justera vid behov
          </span>
        )}
        </div>
      </div>

      {/* ── Floor picker ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-[3px]">
        {Array.from({ length: Math.min(totalFloors, 10) }, (_, i) => i + 1).map(
          (f) => (
            <button
              key={f}
              onClick={() => setFloor(f)}
              className={`w-[20px] h-[20px] text-[10px] font-bold rounded-[4px] transition-all duration-100 ${
                floor === f
                  ? "bg-accent text-white shadow-sm scale-110"
                  : "bg-black/[0.05] text-muted hover:bg-black/[0.09] hover:text-ink"
              }`}
            >
              {f}
            </button>
          )
        )}
        {totalFloors > 10 && (
          <span className="text-[9px] text-muted self-center ml-0.5">
            +{totalFloors - 10}
          </span>
        )}
      </div>

      {/* ── Location micro-indicator ─────────────────────────────────────── */}
      <div className="flex items-center gap-1 -mt-1">
        <MapPin size={8} className="text-muted/60 shrink-0" />
        <span className="text-[8px] text-muted/70 tabular-nums truncate font-mono">
          {lat.toFixed(4)}, {lng.toFixed(4)}
        </span>
      </div>

      {/* ── Validation error ──────────────────────────────────────────────── */}
      {isInvalidFloor ? (
        <p className="text-[10px] font-semibold text-red-500 leading-snug">
          Ogiltig våning — välj 1–{totalFloors}
        </p>
      ) : (
        <>
          {/* ── Grade badge + winter hours ──────────────────────────────── */}
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-lg font-black text-[15px] leading-none text-white shrink-0 shadow-sm"
              style={{ background: gradeColor }}
            >
              {analysis?.grade}
            </div>
            <div className="flex flex-col min-w-0 leading-tight">
              <span className="text-[9px] font-medium text-muted truncate">{gradeLabel}</span>
              <span className="text-[12px] font-bold text-ink tabular-nums">
                {winterText}
              </span>
              <span className="text-[9px] text-muted">vinter-sol</span>
            </div>
          </div>

          {/* ── Vinter-check ───────────────────────────────────────────── */}
          <p className="text-[9.5px] text-muted leading-snug">
            <span className="font-semibold text-ink/80">
              Vinter-check (Vån. {floor}):
            </span>{" "}
            {(analysis?.winter_sun_hours ?? 0) < 0.05
              ? `Vån. ${floor} får ingen direkt sol på vintersolståndet.`
              : `Vån. ${floor} ser solen i ${winterText} på vintersolståndet.`}
          </p>
        </>
      )}

      {/* ── Premium blurred preview ───────────────────────────────────── */}
      <div className="relative rounded-lg overflow-hidden border border-black/[0.07] bg-surface mt-auto">
        {/* Blurred bar chart — all floors, winter hours */}
        <div
          className="blur-sm pointer-events-none select-none"
          style={{ height: 56 }}
          aria-hidden="true"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
            >
              <XAxis
                dataKey="floor"
                tick={{ fontSize: 7, fill: "#A0A0A0" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide domain={[0, 8]} />
              <Bar dataKey="hours" radius={[2, 2, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={gradeToColor(entry.grade)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Lock overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/75 backdrop-blur-[1px]">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white
                       text-[10px] font-bold shadow-md
                       transition-transform duration-100 hover:scale-105 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #E8621A 0%, #F59E0B 100%)",
            }}
            onClick={() =>
              // TODO: wire Stripe / Supabase payment gate
              alert("Betalningsfunktionen lanseras snart — håll utkik!")
            }
          >
            <Lock size={9} strokeWidth={2.5} />
            Lås upp
          </button>
          <span className="text-[8px] text-muted/90 text-center leading-tight px-1">
            Jämför alla {totalFloors} våningar
          </span>
        </div>
      </div>

      {/* ── Locating indicator — thin bar so analysis data stays visible ─── */}
      {loading && (
        <div className="absolute top-0 left-0 right-0 flex items-center gap-1 px-2 py-[3px]
                        bg-accent/10 border-b border-accent/20 z-10 rounded-tr-lg">
          <Loader2 size={9} className="text-accent animate-spin shrink-0" />
          <span className="text-[8px] font-semibold text-accent truncate">Laddar adress…</span>
        </div>
      )}
    </div>
  );
}
