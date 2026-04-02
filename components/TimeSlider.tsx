"use client";

import { useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

type Season = "today" | "winter" | "summer";

interface SeasonOption {
  id: Season;
  label: string;
  getDate: () => Date;
}

interface TimeSliderProps {
  sunDate: Date;
  onDateChange: (date: Date) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEASONS: SeasonOption[] = [
  {
    id: "today",
    label: "Idag",
    getDate: () => new Date(),
  },
  {
    id: "winter",
    label: "Vinter",
    getDate: () => {
      const d = new Date();
      d.setMonth(11, 21); // December 21
      return d;
    },
  },
  {
    id: "summer",
    label: "Sommar",
    getDate: () => {
      const d = new Date();
      d.setMonth(5, 21); // June 21
      return d;
    },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dateToMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function getSeasonId(date: Date): Season {
  const m = date.getMonth();
  const d = date.getDate();
  const todayRef = new Date();

  if (
    todayRef.getFullYear() === date.getFullYear() &&
    todayRef.getMonth() === m &&
    Math.abs(todayRef.getDate() - d) <= 1
  ) {
    return "today";
  }
  if (m === 11 && d === 21) return "winter";
  if (m === 5 && d === 21) return "summer";
  return "today";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TimeSlider({ sunDate, onDateChange }: TimeSliderProps) {
  const currentMinutes = dateToMinutes(sunDate);
  const activeSeason = getSeasonId(sunDate);

  // Keep a stable ref to onDateChange to avoid stale closures inside RAF
  const onDateChangeRef = useRef(onDateChange);
  onDateChangeRef.current = onDateChange;

  // ── Season switch ──────────────────────────────────────────────────────────
  const handleSeasonClick = useCallback(
    (option: SeasonOption) => {
      const base = option.getDate();
      base.setHours(sunDate.getHours(), sunDate.getMinutes(), 0, 0);
      onDateChange(base);
    },
    [sunDate, onDateChange]
  );

  // ── Slider (RAF-backed for 60fps map updates) ──────────────────────────────
  const rafId = useRef<number | null>(null);

  const handleSliderInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const minutes = Number(e.target.value);

      // Cancel any pending RAF so we never queue up lag
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }

      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        const next = new Date(sunDate);
        next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
        onDateChangeRef.current(next);
      });
    },
    [sunDate]
  );

  const progress = currentMinutes / 1439; // 0–1 for gradient fill

  return (
    <div className="w-full px-5 pb-4 pt-3 flex flex-col gap-3">

      {/* ── Season tabs ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {SEASONS.map((option) => {
          const isActive = activeSeason === option.id;
          return (
            <motion.button
              key={option.id}
              onClick={() => handleSeasonClick(option)}
              className="relative px-4 py-1.5 text-xs font-semibold rounded-full transition-colors duration-150 focus:outline-none"
              style={{ color: isActive ? "#E8621A" : "#6B6B6B" }}
              whileTap={{ scale: 0.94 }}
            >
              {/* Animated pill background */}
              <AnimatePresence>
                {isActive && (
                  <motion.span
                    layoutId="season-pill"
                    className="absolute inset-0 rounded-full bg-accent/10 border border-accent/25"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </AnimatePresence>
              <span className="relative z-10">{option.label}</span>
            </motion.button>
          );
        })}

        {/* Time display (right-aligned) */}
        <motion.span
          key={formatMinutes(currentMinutes)}
          className="ml-auto text-sm font-mono font-semibold text-ink tabular-nums"
          initial={{ opacity: 0.4, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.12 }}
        >
          {formatMinutes(currentMinutes)}
        </motion.span>
      </div>

      {/* ── Time slider ─────────────────────────────────────────────────── */}
      <div className="relative w-full flex items-center gap-3">

        {/* Tick marks for 6h intervals */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-0 pointer-events-none">
          {[0, 6, 12, 18, 24].map((h) => (
            <span
              key={h}
              className="text-[9px] text-muted/60 font-medium select-none"
              style={{ width: 0, display: "flex", justifyContent: "center" }}
            >
              {h === 24 ? "" : `${h.toString().padStart(2, "0")}h`}
            </span>
          ))}
        </div>

        {/* Native range + custom track via CSS vars */}
        <input
          type="range"
          min={0}
          max={1439}
          step={1}
          value={currentMinutes}
          onChange={handleSliderInput}
          className="time-slider w-full"
          style={
            {
              "--progress": `${progress * 100}%`,
            } as React.CSSProperties
          }
        />
      </div>

      {/* ── Sub-labels (sunrise/sunset hints — Step 2 will replace with graph) */}
      <div className="flex justify-between text-[10px] text-muted/70 font-medium -mt-1 px-0.5">
        <span>Midnatt</span>
        <span>Middag</span>
        <span>Midnatt</span>
      </div>
    </div>
  );
}
