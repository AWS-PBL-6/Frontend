import type { RiskLevel, VesselStatus } from "../lib/types";

/** HUD status tokens — validated ≥3:1 on dark surfaces; always paired with a
 *  text label (색상 단독으로 의미를 전달하지 않음). */
export const HUD_RISK: Record<RiskLevel, string> = {
  NORMAL: "#0ca30c",
  CAUTION: "#fab219",
  DANGER: "#d03b3b",
};

/** Brighter emissive variants for light-emitting marks inside the 3D scene.
 *  CAUTION leans amber so it never reads as green after tone mapping. */
export const SCENE_RISK: Record<RiskLevel, { base: string; emissive: string }> = {
  NORMAL: { base: "#1d7a3c", emissive: "#2fbf5f" },
  CAUTION: { base: "#8a6a10", emissive: "#ffb020" },
  DANGER: { base: "#a32c22", emissive: "#ff4433" },
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  NORMAL: "정상",
  CAUTION: "주의",
  DANGER: "위험",
};

export const STATUS_LABEL: Record<VesselStatus, string> = {
  BERTHED: "접안",
  APPROACHING: "접근 중",
  DEPARTED: "출항",
};

export const RISK_ORDER: Record<RiskLevel, number> = { NORMAL: 0, CAUTION: 1, DANGER: 2 };

export function worstRisk(levels: RiskLevel[]): RiskLevel {
  let worst: RiskLevel = "NORMAL";
  for (const l of levels) if (RISK_ORDER[l] > RISK_ORDER[worst]) worst = l;
  return worst;
}

/** Display risk of a line: an unmoored line (no vessel made fast) is always
 *  NORMAL — a shore-bollard sensor with no ship on it cannot be at mooring
 *  risk. Use this everywhere risk is shown instead of the raw riskLevel. */
export function effectiveRisk(line: { vesselId?: string | null; riskLevel: RiskLevel }): RiskLevel {
  return line.vesselId ? line.riskLevel : "NORMAL";
}

/** Selection / route accent — deliberately outside the reserved status hues. */
export const ACCENT = "#4fc3ff";
