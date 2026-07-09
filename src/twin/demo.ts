import { useEffect, useMemo, useRef, useState } from "react";
import type { Bollard, LineStatus, LiveData, RiskLevel, Vessel } from "../lib/types";

/* Self-contained live simulation for the digital twin: no backend, no auth.
 * Drives the public /demo route and doubles as a presentation mode. Risk
 * scores random-walk while one scripted line cycles 정상→주의→위험→복구 so the
 * snap-back zone and alert states can be seen on a loop. */

const now = () => new Date().toISOString();

const VESSELS: Vessel[] = [
  {
    vesselId: "V-HANBADA", name: "HANBADA STAR", siteId: "busan", berthId: "PNC-1",
    imo: "9312878", vesselType: "Container", lengthOverallM: 232, lat: 35.0765, lon: 128.8082,
    status: "BERTHED", createdAt: now(), updatedAt: now(),
  },
  {
    vesselId: "V-GLORY", name: "BUSAN GLORY", siteId: "busan", berthId: "PNC-2",
    imo: "9455551", vesselType: "Bulk Carrier", lengthOverallM: 178, lat: 35.0771, lon: 128.8103,
    status: "BERTHED", createdAt: now(), updatedAt: now(),
  },
  {
    vesselId: "V-SEBO", name: "SEBO PIONEER", siteId: "busan", berthId: "PNC-3",
    imo: "9204219", vesselType: "Tanker", lengthOverallM: 146, lat: 35.0777, lon: 128.8121,
    status: "BERTHED", createdAt: now(), updatedAt: now(),
  },
  {
    vesselId: "V-ARIRANG", name: "ARIRANG EXPRESS", siteId: "busan", berthId: "PNC-4",
    imo: "9786451", vesselType: "Container", lengthOverallM: 199, lat: 35.0612, lon: 128.8419,
    status: "APPROACHING", createdAt: now(), updatedAt: now(),
  },
  {
    vesselId: "V-DONGBAEK", name: "DONGBAEK", siteId: "busan", berthId: "PNC-1",
    imo: "9123441", vesselType: "General Cargo", lengthOverallM: 118, lat: 35.05, lon: 128.9,
    status: "DEPARTED", createdAt: now(), updatedAt: now(),
  },
];

interface Seed { lineId: string; vesselId: string | null; bollardId: string; score: number }

// bollardId = the sensor's permanent shore bollard (fixed asset); vesselId is
// the transient berthing association. L-901's bollard has no vessel moored yet.
const SEEDS: Seed[] = [
  { lineId: "L-101", vesselId: "V-HANBADA", bollardId: "Q-A01", score: 0.12 },
  { lineId: "L-102", vesselId: "V-HANBADA", bollardId: "Q-A01", score: 0.2 }, // shares Q-A01 with L-101 (2 lines, 1 bollard)
  { lineId: "L-103", vesselId: "V-HANBADA", bollardId: "Q-A05", score: 0.3 }, // scripted incident line
  { lineId: "L-104", vesselId: "V-HANBADA", bollardId: "Q-A07", score: 0.16 },
  { lineId: "L-201", vesselId: "V-GLORY", bollardId: "Q-B02", score: 0.18 },
  { lineId: "L-202", vesselId: "V-GLORY", bollardId: "Q-B04", score: 0.52 },
  { lineId: "L-203", vesselId: "V-GLORY", bollardId: "Q-B06", score: 0.22 },
  { lineId: "L-301", vesselId: "V-SEBO", bollardId: "Q-C02", score: 0.1 },
  { lineId: "L-302", vesselId: "V-SEBO", bollardId: "Q-C04", score: 0.14 },
  { lineId: "L-303", vesselId: "V-SEBO", bollardId: "Q-C06", score: 0.25 },
  { lineId: "L-401", vesselId: "V-ARIRANG", bollardId: "Q-D02", score: 0.08 },
  { lineId: "L-402", vesselId: "V-ARIRANG", bollardId: "Q-D04", score: 0.08 },
  { lineId: "L-901", vesselId: null, bollardId: "Q-A09", score: 0.2 },
];

const levelOf = (score: number): RiskLevel =>
  score >= 0.7 ? "DANGER" : score >= 0.45 ? "CAUTION" : "NORMAL";

// Fixed shore bollards behind the demo lines (permanent assets). The demo
// itself IS the simulation, so every bollard runs in VIRTUAL sensor mode.
const BOLLARDS: Bollard[] = Array.from(new Set(SEEDS.map((s) => s.bollardId))).map((id, i) => ({
  bollardId: id,
  siteId: "busan",
  berthId: "PNC",
  positionM: i * 20,
  label: id,
  twinSlot: null,
  sensorMode: "VIRTUAL" as const,
  sensorId: null,
  sensorBoundAt: now(),
  createdAt: now(),
  updatedAt: now(),
}));

function makeLine(s: Seed): LineStatus {
  return {
    lineId: s.lineId,
    siteId: "busan",
    berthId: "PNC",
    riskLevel: levelOf(s.score),
    riskScore: s.score,
    updatedAt: now(),
    layout: { anchorX: 0, anchorY: 0, headingDeg: 0 },
    lastEventId: null,
    snapbackZone: null,
    deviceOnline: true,
    bollardId: s.bollardId,
    vesselId: s.vesselId,
  };
}

/** Scripted 100 s incident cycle for L-103: calm → rising → DANGER → recover. */
function scriptedScore(tSec: number): number {
  const t = tSec % 100;
  if (t < 30) return 0.25 + (t / 30) * 0.15; // calm drift up
  if (t < 55) return 0.4 + ((t - 30) / 25) * 0.28; // escalate through CAUTION
  if (t < 80) return 0.82 + Math.sin(t * 2.1) * 0.06; // hold in DANGER
  return 0.82 - ((t - 80) / 20) * 0.6; // recover
}

export function useDemoLive(): LiveData {
  const [lines, setLines] = useState<LineStatus[]>(() => SEEDS.map(makeLine));
  const epoch = useRef(Date.now());

  useEffect(() => {
    const tick = setInterval(() => {
      const tSec = (Date.now() - epoch.current) / 1000;
      setLines((prev) =>
        prev.map((l) => {
          let score: number;
          if (l.lineId === "L-103") {
            score = scriptedScore(tSec);
          } else {
            const drift = (Math.random() - 0.5) * 0.06;
            const seed = SEEDS.find((s) => s.lineId === l.lineId)?.score ?? 0.2;
            score = Math.min(0.68, Math.max(0.04, l.riskScore + drift + (seed - l.riskScore) * 0.05));
          }
          const riskLevel = levelOf(score);
          return {
            ...l,
            riskScore: Math.round(score * 100) / 100,
            riskLevel,
            snapbackZone:
              riskLevel === "DANGER" ? { radiusMeters: 28, polygon: [] } : null,
            updatedAt: now(),
          };
        }),
      );
    }, 2000);
    return () => clearInterval(tick);
  }, []);

  return useMemo<LiveData>(
    () => ({
      lines,
      vessels: VESSELS,
      bollards: BOLLARDS,
      summary: null,
      loaded: true,
      error: null,
      reload: () => {},
    }),
    [lines],
  );
}
