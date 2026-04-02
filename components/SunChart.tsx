"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import { buildDayCurve, getSunTimes } from "@/lib/sun-logic";

// Stockholm default coords — used when no property is selected
const DEFAULT_LAT = 59.333;
const DEFAULT_LNG = 18.067;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  if (!date || isNaN(date.getTime())) return "—";
  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

function xTickFormatter(minutes: number): string {
  const map: Record<number, string> = {
    0: "00",
    360: "06",
    720: "12",
    1080: "18",
    1439: "24",
  };
  return map[minutes] ?? "";
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[9px] font-semibold text-muted uppercase tracking-[0.1em] truncate">
        {label}
      </span>
      <span className="text-[13px] font-semibold text-ink tabular-nums leading-snug">
        {value}
      </span>
    </div>
  );
}

// ─── Legend dot ──────────────────────────────────────────────────────────────

function LegendItem({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block w-5 rounded-sm"
        style={{
          height: 2,
          background: dashed ? "none" : color,
          borderTop: dashed ? `2px dashed ${color}` : "none",
          opacity: dashed ? 0.6 : 1,
        }}
      />
      <span className="text-[9px] font-medium text-muted/80">{label}</span>
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface SunChartProps {
  sunDate: Date;
  lat?: number;
  lng?: number;
}

export default function SunChart({ sunDate, lat, lng }: SunChartProps) {
  const LAT = lat ?? DEFAULT_LAT;
  const LNG = lng ?? DEFAULT_LNG;

  const currentMinutes = sunDate.getHours() * 60 + sunDate.getMinutes();

  // Day-granular key — curves only need re-building when the calendar date or
  // location changes, not on every slider tick (1440 ticks/day performance).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dateKey = `${sunDate.getFullYear()}-${sunDate.getMonth()}-${sunDate.getDate()}-${LAT.toFixed(4)}-${LNG.toFixed(4)}`;
  const yearLocKey = `${sunDate.getFullYear()}-${LAT.toFixed(4)}-${LNG.toFixed(4)}`;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todayCurve = useMemo(() => buildDayCurve(LAT, LNG, sunDate), [dateKey]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const winterCurve = useMemo(
    () => buildDayCurve(LAT, LNG, new Date(sunDate.getFullYear(), 11, 21, 12, 0, 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearLocKey]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const summerCurve = useMemo(
    () => buildDayCurve(LAT, LNG, new Date(sunDate.getFullYear(), 5, 21, 12, 0, 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearLocKey]
  );

  // Merge all 3 curves into a single flat dataset for ComposedChart.
  // todayPos is clamped ≥ 0 to drive the Area fill (above-horizon only).
  // todayRaw is the true line including negative values (below horizon).
  const chartData = useMemo(
    () =>
      todayCurve.map((pt, i) => ({
        minutes: pt.minutes,
        todayPos: Math.max(pt.altitudeDeg, 0),
        todayRaw: pt.altitudeDeg,
        winter: winterCurve[i]?.altitudeDeg ?? 0,
        summer: summerCurve[i]?.altitudeDeg ?? 0,
      })),
    [todayCurve, winterCurve, summerCurve]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sunTimes = useMemo(() => getSunTimes(LAT, LNG, sunDate), [dateKey]);

  const sunriseMin =
    sunTimes.sunrise.getHours() * 60 + sunTimes.sunrise.getMinutes();
  const sunsetMin =
    sunTimes.sunset.getHours() * 60 + sunTimes.sunset.getMinutes();
  const dayLengthMin = Math.max(0, sunsetMin - sunriseMin);

  const maxAlt = useMemo(
    () => Math.max(...todayCurve.map((p) => p.altitudeDeg)),
    [todayCurve]
  );

  return (
    <div className="px-5 pt-3 pb-0 flex flex-col gap-2">

      {/* ── Summary stats ──────────────────────────────────────────────────── */}
      <div className="flex items-start gap-5 flex-wrap">
        <StatCard
          label="Daglängd"
          value={`${Math.floor(dayLengthMin / 60)}t ${dayLengthMin % 60}m`}
        />
        <StatCard label="Soluppgång" value={formatTime(sunTimes.sunrise)} />
        <StatCard label="Solnedgång" value={formatTime(sunTimes.sunset)} />
        <StatCard label="Max Höjd" value={`${maxAlt.toFixed(1)}°`} />
      </div>

      {/* ── Chart ─────────────────────────────────────────────────────────── */}
      <div className="w-full" style={{ height: 96 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 6, right: 2, left: -30, bottom: 0 }}
          >
            <defs>
              <linearGradient id="sunFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E8621A" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#E8621A" stopOpacity={0.03} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="minutes"
              type="number"
              domain={[0, 1439]}
              ticks={[0, 360, 720, 1080, 1439]}
              tickFormatter={xTickFormatter}
              tick={{ fontSize: 8, fill: "#A0A0A0" }}
              axisLine={false}
              tickLine={false}
            />
            {/* Y-axis hidden — stats cards carry the numbers */}
            <YAxis domain={["auto", "auto"]} hide />

            {/* Horizon line */}
            <ReferenceLine
              y={0}
              stroke="#00000018"
              strokeWidth={1}
            />

            {/* ── Season reference curves (rendered first → underneath) ── */}
            <Line
              dataKey="summer"
              stroke="#D97706"
              strokeWidth={1}
              strokeDasharray="5 4"
              dot={false}
              activeDot={false}
              strokeOpacity={0.4}
              legendType="none"
              isAnimationActive={false}
            />
            <Line
              dataKey="winter"
              stroke="#60A5FA"
              strokeWidth={1}
              strokeDasharray="5 4"
              dot={false}
              activeDot={false}
              strokeOpacity={0.4}
              legendType="none"
              isAnimationActive={false}
            />

            {/* ── Today's Area fill (above-horizon only, no stroke) ──────── */}
            <Area
              dataKey="todayPos"
              fill="url(#sunFill)"
              stroke="none"
              dot={false}
              activeDot={false}
              legendType="none"
              isAnimationActive={false}
            />

            {/* ── Today's true curve line (full range, incl. below 0) ────── */}
            <Line
              dataKey="todayRaw"
              stroke="#E8621A"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              legendType="none"
              isAnimationActive={false}
            />

            {/* ── Current time vertical indicator ───────────────────────── */}
            <ReferenceLine
              x={currentMinutes}
              stroke="#E8621A"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />

            {/* ── Sunrise / Sunset dots ──────────────────────────────────── */}
            <ReferenceDot
              x={sunriseMin}
              y={0}
              r={3}
              fill="#E8621A"
              stroke="white"
              strokeWidth={1.5}
            />
            <ReferenceDot
              x={sunsetMin}
              y={0}
              r={3}
              fill="#E8621A"
              stroke="white"
              strokeWidth={1.5}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 pb-1">
        <LegendItem color="#E8621A" label="Idag" />
        <LegendItem color="#D97706" label="Sommar" dashed />
        <LegendItem color="#60A5FA" label="Vinter" dashed />
      </div>
    </div>
  );
}
