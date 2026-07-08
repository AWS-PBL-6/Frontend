import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { LineStatus, RiskLevel, Vessel } from "../lib/types";

const RISK_COLOR: Record<RiskLevel, string> = {
  NORMAL: "#6f8476",
  CAUTION: "#b0894f",
  DANGER: "#a8493f",
};
const RISK_LABEL: Record<RiskLevel, string> = { NORMAL: "정상", CAUTION: "주의", DANGER: "위험" };
const RISK_ORDER: Record<RiskLevel, number> = { NORMAL: 0, CAUTION: 1, DANGER: 2 };

/** Highest risk among a vessel's mooring lines (drives the marker colour). */
export function worstRisk(lines: LineStatus[]): RiskLevel {
  let worst: RiskLevel = "NORMAL";
  for (const l of lines) if (RISK_ORDER[l.riskLevel] > RISK_ORDER[worst]) worst = l.riskLevel;
  return worst;
}

interface Placed {
  vessel: Vessel;
  lat: number;
  lon: number;
  risk: RiskLevel;
  lineCount: number;
}

export function VesselMap({
  vessels,
  lines,
  selectedVesselId,
  onSelect,
}: {
  vessels: Vessel[];
  lines: LineStatus[];
  selectedVesselId: string | null;
  onSelect: (v: Vessel) => void;
}) {
  const placed: Placed[] = vessels
    .filter((v) => typeof v.lat === "number" && typeof v.lon === "number")
    .map((v) => {
      const vlines = lines.filter((l) => l.vesselId === v.vesselId);
      return {
        vessel: v,
        lat: v.lat as number,
        lon: v.lon as number,
        risk: worstRisk(vlines),
        lineCount: vlines.length,
      };
    });

  const center: [number, number] = placed.length
    ? [
        placed.reduce((s, p) => s + p.lat, 0) / placed.length,
        placed.reduce((s, p) => s + p.lon, 0) / placed.length,
      ]
    : [34.7842, 126.517];

  return (
    <div className="map-wrap map-wrap--leaflet">
      <MapContainer center={center} zoom={15} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {placed.map((p) => {
          const selected = p.vessel.vesselId === selectedVesselId;
          const color = RISK_COLOR[p.risk];
          return (
            <CircleMarker
              key={p.vessel.vesselId}
              center={[p.lat, p.lon]}
              radius={selected ? 15 : 11}
              pathOptions={{
                color: selected ? "#ffffff" : color,
                weight: selected ? 3 : 2,
                fillColor: color,
                fillOpacity: 0.85,
              }}
              eventHandlers={{ click: () => onSelect(p.vessel) }}
            >
              <Tooltip direction="top" offset={[0, -10]}>
                <b>{p.vessel.name}</b>
                <br />
                {RISK_LABEL[p.risk]} · 계류삭 {p.lineCount}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      {placed.length === 0 && (
        <div className="map-empty">
          위·경도가 설정된 선박이 없습니다. <b>선박 관리</b>에서 위치를 등록하세요.
        </div>
      )}
    </div>
  );
}
