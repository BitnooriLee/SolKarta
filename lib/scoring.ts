import { analyzeFloor } from "./floor-analysis";
import type { SunGrade, FloorAnalysis } from "./floor-analysis";

export type { SunGrade };
export { scoreToGrade } from "./floor-analysis";

const DEFAULT_LAT = 59.333;
const DEFAULT_LNG = 18.067;

export interface SunScore {
  score: number;
  grade: SunGrade;
  winter_hours: number;
  summer_hours: number;
  floor: number;
  label: string;
  badgeColor: string;
}

/** Compute a displayable SunScore for a location + floor combination. */
export function computeSunScore(
  lat = DEFAULT_LAT,
  lng = DEFAULT_LNG,
  floor = 1,
  year = new Date().getFullYear()
): SunScore {
  const analysis: FloorAnalysis = analyzeFloor(lat, lng, floor, year);
  return {
    score: analysis.score,
    grade: analysis.grade,
    winter_hours: analysis.winter_sun_hours,
    summer_hours: analysis.summer_sun_hours,
    floor,
    label: gradeToSwedishLabel(analysis.grade),
    badgeColor: gradeToColor(analysis.grade),
  };
}

export function gradeToSwedishLabel(grade: SunGrade): string {
  const map: Record<SunGrade, string> = {
    "A+": "Exceptionellt",
    "A":  "Utmärkt",
    "A-": "Mycket bra",
    "B+": "Bra",
    "B":  "Ganska bra",
    "B-": "Godkänd",
    "C+": "Medel",
    "C":  "Under medel",
    "C-": "Begränsad sol",
    "D":  "Dålig sol",
    "F":  "Minimal sol",
  };
  return map[grade];
}

export function gradeToColor(grade: SunGrade): string {
  if (grade === "A+" || grade === "A")  return "#16A34A"; // green-600
  if (grade === "A-" || grade === "B+") return "#65A30D"; // lime-600
  if (grade === "B"  || grade === "B-") return "#CA8A04"; // yellow-600
  if (grade.startsWith("C"))            return "#EA580C"; // orange-600
  return "#DC2626";                                        // red-600
}
