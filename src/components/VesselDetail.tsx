import type { LineStatus, RiskLevel, Vessel, VesselStatus } from "../lib/types";

const RISK_COLOR: Record<RiskLevel, string> = {
  NORMAL: "#6f8476",
  CAUTION: "#b0894f",
  DANGER: "#a8493f",
};
const RISK_LABEL: Record<RiskLevel, string> = { NORMAL: "정상", CAUTION: "주의", DANGER: "위험" };
const STATUS_LABEL: Record<VesselStatus, string> = {
  BERTHED: "접안",
  APPROACHING: "접근 중",
  DEPARTED: "출항",
};

/** Slide-over showing a vessel's particulars and its mooring lines. Clicking a
 *  line opens that line's latest sentinel (event) detail. */
export function VesselDetail({
  vessel,
  lines,
  onClose,
  onOpenLine,
}: {
  vessel: Vessel;
  lines: LineStatus[];
  onClose: () => void;
  onOpenLine: (line: LineStatus) => void;
}) {
  const vlines = lines.filter((l) => l.vesselId === vessel.vesselId);

  return (
    <>
      <div className="slideover-backdrop" onClick={onClose} />
      <aside className="slideover" role="dialog" aria-modal="true">
        <div className="slideover-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong>{vessel.name}</strong>
            <span className="badge">{STATUS_LABEL[vessel.status]}</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="slideover-body">
          <div>
            <div className="section-label">선박 정보</div>
            <div className="kv">
              <div>
                <span>IMO</span>
                <b>{vessel.imo || "–"}</b>
              </div>
              <div>
                <span>선종</span>
                <b>{vessel.vesselType || "–"}</b>
              </div>
              <div>
                <span>전장 (LOA)</span>
                <b>{vessel.lengthOverallM != null ? `${vessel.lengthOverallM} m` : "–"}</b>
              </div>
              <div>
                <span>선석 (Berth)</span>
                <b>{vessel.berthId || "–"}</b>
              </div>
              <div>
                <span>위도</span>
                <b>{vessel.lat != null ? vessel.lat.toFixed(4) : "–"}</b>
              </div>
              <div>
                <span>경도</span>
                <b>{vessel.lon != null ? vessel.lon.toFixed(4) : "–"}</b>
              </div>
            </div>
          </div>

          <div>
            <div className="section-label">계류삭 · 연결 고리 센서 ({vlines.length})</div>
            <div className="rail">
              {vlines.map((l) => (
                <button className="rail-item" key={l.lineId} onClick={() => onOpenLine(l)}>
                  <span className={`dot dot--${l.riskLevel}`} />
                  <span className="rail-id">{l.lineId}</span>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {l.sensorMode === "DEVICE" ? l.sensorId : l.sensorMode === "VIRTUAL" ? "시연용" : "센서 미연동"}
                  </span>
                  <span className="badge" style={{ marginLeft: 2 }}>
                    {RISK_LABEL[l.riskLevel]}
                  </span>
                  <span className="rail-bar">
                    <i
                      style={{
                        width: `${Math.round(l.riskScore * 100)}%`,
                        background: RISK_COLOR[l.riskLevel],
                      }}
                    />
                  </span>
                  <span className="rail-score">{l.riskScore.toFixed(2)}</span>
                </button>
              ))}
              {vlines.length === 0 && (
                <div className="muted">이 선박에 연결된 계류삭이 없습니다.</div>
              )}
            </div>
          </div>

          <div className="muted" style={{ fontSize: 11 }}>
            {vessel.vesselId} · 갱신 {vessel.updatedAt}
          </div>
        </div>
      </aside>
    </>
  );
}
