"use client";

import TimeSlider from "@/components/TimeSlider";
import SunChart from "@/components/SunChart";
import AnalysisCard from "@/components/AnalysisCard";

interface BottomPanelProps {
  analysisCardKey: string;
  sunDate: Date;
  onDateChange: (date: Date) => void;
  lat: number;
  lng: number;
  /** Map-derived storey estimate; null = unknown / no 3D building metadata */
  buildingStoreysHint?: number | null;
  locating?: boolean;
}

export default function BottomPanel({
  analysisCardKey,
  sunDate,
  onDateChange,
  lat,
  lng,
  buildingStoreysHint = null,
  locating,
}: BottomPanelProps) {
  return (
    <aside className="shrink-0 bg-panel border-t border-black/[0.06] z-10 overflow-hidden">
      {/* Insight row: sun altitude graph (left) + floor analysis card (right) */}
      <div className="flex items-stretch">
        <div className="flex-1 min-w-0">
          <SunChart sunDate={sunDate} lat={lat} lng={lng} />
        </div>
        <AnalysisCard
          key={analysisCardKey}
          lat={lat}
          lng={lng}
          buildingStoreysHint={buildingStoreysHint}
          loading={locating}
        />
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-black/[0.05]" />

      {/* Time + season controls */}
      <TimeSlider sunDate={sunDate} onDateChange={onDateChange} />
    </aside>
  );
}
