import { Suspense, lazy } from "react";
import type { LineStatus, RiskLevel } from "../lib/types";
import { effectiveRisk } from "../twin/palette";
import { acousticReading, DAMAGE_LABEL, DAMAGE_RISK } from "../lib/acoustic";

const RopeScene = lazy(() => import("./RopeScene"));

const RISK_LABEL: Record<RiskLevel, string> = { NORMAL: "정상", CAUTION: "주의", DANGER: "위험" };

/** Live mooring-line status window: current risk + 3D rope, works with or
 *  without an ML event. Opens for any line click. When the line has a
 *  ``lastEventId`` it offers the full ML event analysis (EventDetail). */
export function LineDetail({
  line,
  vesselName,
  bollardLabel,
  onClose,
  onOpenEvent,
}: {
  line: LineStatus;
  vesselName?: string | null;
  bollardLabel?: string | null;
  onClose: () => void;
  onOpenEvent?: (eventId: string) => void;
}) {
  const risk = effectiveRisk(line);
  const score = line.vesselId ? line.riskScore : 0;
  // Detailed AE metrics only for a mapped (moored) line — the sensor reads a
  // load only while a vessel is made fast to its bollard.
  const ae = line.vesselId ? acousticReading(line) : null;

  return (
    <>
      <div className="slideover-backdrop" onClick={onClose} />
      <aside className="slideover" role="dialog" aria-modal="true">
        <div className="slideover-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong>{line.lineId}</strong>
            <span className={`badge badge--${risk}`}>
              <span className={`dot dot--${risk}`} />
              {RISK_LABEL[risk]} · {score.toFixed(2)}
            </span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="slideover-body">
          <div className="rope-canvas">
            <span className="rope-tag">three.js · 실시간 홋줄 상태</span>
            <Suspense
              fallback={
                <div className="center" style={{ height: "100%" }}>
                  <div className="spin" />
                </div>
              }
            >
              <RopeScene risk={risk} />
            </Suspense>
          </div>

          <div className="kv">
            <div>
              <span>소속 볼라드</span>
              <b>{bollardLabel || line.bollardId || "–"}</b>
            </div>
            <div>
              <span>계선 선박</span>
              <b>{line.vesselId ? vesselName || line.vesselId : "미계선"}</b>
            </div>
            <div>
              <span>선석 (Berth)</span>
              <b>{line.berthId || "–"}</b>
            </div>
            <div>
              <span>센서</span>
              <b>{line.deviceOnline ? "온라인" : "오프라인"}</b>
            </div>
          </div>

          {ae && (
            <div>
              <div className="section-label">초음파(AE) 센서 분석 · AE-Damage-Detection</div>
              <div
                className="card"
                style={{ padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}
              >
                <span className={`badge badge--${DAMAGE_RISK[ae.damageType]}`}>
                  <span className={`dot dot--${DAMAGE_RISK[ae.damageType]}`} />
                  손상 {ae.damageType}
                </span>
                <b style={{ flex: 1 }}>{DAMAGE_LABEL[ae.damageType]}</b>
                <span className="muted">신뢰도 {(ae.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="kv">
                <div><span>최대 진폭</span><b>{ae.peakAmplitudeDb} dB</b></div>
                <div><span>방출 에너지</span><b>{ae.energyReleaseJ} J</b></div>
                <div><span>신호 지속시간</span><b>{ae.signalDurationMs} ms</b></div>
                <div><span>상승 시간</span><b>{ae.riseTimeMs} ms</b></div>
                <div><span>주파수 스펙트럼</span><b>{ae.frequencyHz} Hz</b></div>
                <div><span>충격 에너지</span><b>{ae.impactEnergyJ} J</b></div>
                <div><span>온도</span><b>{ae.temperatureC} °C</b></div>
                <div><span>습도</span><b>{ae.humidityPct} %</b></div>
                <div><span>섬유 / 수지</span><b>{ae.fiberType} / {ae.resinType}</b></div>
                <div><span>두께</span><b>{ae.thicknessMm} mm</b></div>
              </div>
            </div>
          )}

          {!line.vesselId && (
            <div className="alert-msg" style={{ background: "var(--wire)", color: "var(--graphite)", borderColor: "var(--line)" }}>
              미계선 상태(접안 선박 없음) — 위험도는 항상 정상입니다.
            </div>
          )}

          {risk === "DANGER" && line.snapbackZone && (
            <div className="card" style={{ padding: "12px 14px" }}>
              <div className="section-label">스냅백 위험구역</div>
              <div>
                <b style={{ fontSize: 18 }}>{line.snapbackZone.radiusMeters} m</b>{" "}
                <span className="muted">반경 — 구역 밖 대피 유도</span>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            {line.lastEventId && onOpenEvent && (
              <button
                className="btn btn-accent"
                style={{ flex: 1 }}
                onClick={() => onOpenEvent(line.lastEventId!)}
              >
                정밀 분석 (이벤트)
              </button>
            )}
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
              닫기
            </button>
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            {line.lineId} · 갱신 {line.updatedAt}
          </div>
        </div>
      </aside>
    </>
  );
}
