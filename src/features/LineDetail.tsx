import { Suspense, lazy, useEffect, useState } from "react";
import { RadioTower } from "lucide-react";
import type { EventRecord, LineStatus, RiskLevel } from "../lib/types";
import { effectiveRisk } from "../twin/palette";
import { api } from "../lib/api";
import { piezoBand, piezoGuideBands } from "../lib/piezo";
import { PiezoSensorPicker } from "../components/PiezoSensorPicker";
import {
  fromEvent,
  syntheticReading,
  SIGNAL_LABEL,
  SIGNAL_RISK,
  type AeReading,
} from "../lib/acoustic";

const RopeScene = lazy(() => import("./RopeScene"));

const RISK_LABEL: Record<RiskLevel, string> = { NORMAL: "정상", CAUTION: "주의", DANGER: "위험" };

/** Live mooring-line status window: current risk + 3D rope + AE metrics.
 *  A moored line with a ``lastEventId`` shows the real ML event's features
 *  (fetched); demo/backendless lines fall back to a synthetic reading. */
export function LineDetail({
  line,
  vesselName,
  bollardLabel,
  onClose,
  onOpenEvent,
  onChanged,
  readOnly = false,
}: {
  line: LineStatus;
  vesselName?: string | null;
  bollardLabel?: string | null;
  onClose: () => void;
  onOpenEvent?: (eventId: string) => void;
  onChanged?: () => void;
  readOnly?: boolean;
}) {
  const risk = effectiveRisk(line);
  const score = line.vesselId ? line.riskScore : 0;

  // Real ML event features when the moored line has one; else synthetic.
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [binding, setBinding] = useState(false);
  const [selectedSensorId, setSelectedSensorId] = useState("");
  const [bindingBusy, setBindingBusy] = useState(false);
  const [bindingError, setBindingError] = useState<string | null>(null);
  useEffect(() => {
    setEvent(null);
    if (!line.vesselId || !line.lastEventId) return;
    let alive = true;
    api.getEvent(line.lastEventId).then((e) => alive && setEvent(e)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [line.lineId, line.vesselId, line.lastEventId]);

  const ae: AeReading | null = !line.vesselId || line.sensorMode === "PENDING"
    ? null
    : event
      ? fromEvent(event)
      : line.sensorMode === "VIRTUAL"
        ? syntheticReading(line)
        : null;
  const sigRisk = ae ? SIGNAL_RISK[ae.signalType] ?? "NORMAL" : "NORMAL";
  const piezoGuide = ae?.sensorKind === "piezo" ? piezoGuideBands() : null;
  const measuredFreq = ae?.sensorKind === "piezo" ? ae.structuralFreqHz ?? null : null;
  const piezoRisk = measuredFreq != null ? piezoBand(measuredFreq) : "NORMAL";

  const bindDevice = async () => {
    const sensorId = selectedSensorId.trim();
    if (!sensorId) {
      setBindingError("AWS IoT 목록에서 이 계류삭에 부착할 센서를 선택하세요.");
      return;
    }
    setBindingBusy(true);
    setBindingError(null);
    try {
      await api.provisionLine(line.lineId, { sensorMode: "DEVICE", sensorId });
      setBinding(false);
      setSelectedSensorId("");
      onChanged?.();
    } catch (e) {
      setBindingError(e instanceof Error ? e.message : "센서 연동 실패");
    } finally {
      setBindingBusy(false);
    }
  };

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
          {bindingError && <div className="alert-msg">{bindingError}</div>}
          <div className={`sensor-card sensor-card--${line.sensorMode}`} data-guide="line-sensor-binding">
            <div className="sensor-card-head">
              <RadioTower size={15} />
              <b>
                {line.sensorMode === "DEVICE" && "계류삭 전용 피에조 센서"}
                {line.sensorMode === "VIRTUAL" && "계류삭 시연 센서"}
                {line.sensorMode === "PENDING" && "계류삭 센서 미연동"}
              </b>
              <span className="sensor-card-meta">
                {line.sensorMode === "DEVICE" && `${line.sensorId ?? "–"} · ${line.deviceOnline ? "온라인" : "오프라인"}`}
                {line.sensorBoundAt ? ` · ${line.sensorBoundAt.slice(0, 10)}` : ""}
              </span>
            </div>
            <p className="sensor-card-desc">
              센서는 볼라드가 아니라 선박 측 계류삭 연결 고리(아이·스플라이스 인근)에 부착하며,
              한 센서는 한 계류삭만 측정합니다.
            </p>
            {line.sensorMode !== "DEVICE" && !readOnly && (
              binding ? (
                <div style={{ marginTop: 10 }}>
                  <PiezoSensorPicker
                    selectedSensorId={selectedSensorId}
                    onSelect={setSelectedSensorId}
                    disabled={bindingBusy}
                    currentLineId={line.lineId}
                  />
                  <div className="piezo-picker-actions">
                    <button className="btn btn-accent" disabled={bindingBusy || !selectedSensorId} onClick={bindDevice}>
                      선택 센서 적용
                    </button>
                    <button className="btn btn-ghost" disabled={bindingBusy} onClick={() => setBinding(false)}>
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-accent btn-block" disabled={bindingBusy} onClick={() => setBinding(true)}>
                  피에조 센서 목록에서 선택
                </button>
              )
            )}
          </div>

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
              <b>
                {line.sensorMode === "PENDING"
                  ? "미연동"
                  : line.sensorMode === "VIRTUAL"
                    ? "시연용"
                    : line.deviceOnline ? "온라인" : "오프라인"}
              </b>
            </div>
          </div>

          {ae?.sensorKind === "piezo" && (
            <div>
              <div className="section-label">압전(피에조) 센서 · 구조 진동</div>
              <div className="card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ minWidth: 96 }}>
                  <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>
                    {ae.structuralFreqHz}
                    <span style={{ fontSize: 13, fontWeight: 500 }}> Hz</span>
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>측정 진동수</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                    <span className="muted">추정 장력</span>
                    <b>{Math.round((ae.loadRatio ?? 0) * 100)}% MBL</b>
                  </div>
                  <div style={{ height: 8, background: "var(--wire)", borderRadius: 4, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.round((ae.loadRatio ?? 0) * 100)}%`,
                        height: "100%",
                        background: `var(--${sigRisk.toLowerCase()})`,
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                압전 센서는 진동수만 계측합니다. 아래 음향(AE) 특징량은 taut-cable 관계(T ∝ f²)로 추정한 값입니다.
              </div>
              {piezoGuide && (
                <div className="piezo-threshold-grid">
                  <div className={`piezo-threshold piezo-threshold--NORMAL ${piezoRisk === "NORMAL" ? "is-active" : ""}`}>
                    <span>정상</span>
                    <b>&lt; {piezoGuide.cautionStartHz} Hz</b>
                  </div>
                  <div className={`piezo-threshold piezo-threshold--CAUTION ${piezoRisk === "CAUTION" ? "is-active" : ""}`}>
                    <span>주의</span>
                    <b>{piezoGuide.cautionStartHz}–{piezoGuide.dangerStartHz} Hz</b>
                  </div>
                  <div className={`piezo-threshold piezo-threshold--DANGER ${piezoRisk === "DANGER" ? "is-active" : ""}`}>
                    <span>위험</span>
                    <b>&ge; {piezoGuide.dangerStartHz} Hz</b>
                  </div>
                </div>
              )}
              {piezoGuide && (
                <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                  현재 가이드 기준은 slack {piezoGuide.slackHz} Hz, critical {piezoGuide.criticalHz} Hz 입니다.
                  실제 이벤트 판정은 이 진동수 기준에 더해 ML 추론과 5개 이벤트 시간 정책을 함께 반영합니다.
                </div>
              )}
            </div>
          )}

          {ae && (
            <div>
              <div className="section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {ae.sensorKind === "piezo" ? "음향 방출(AE) · 진동수 기반 추정" : "음향 방출(AE) 이벤트 분석"}
                <span
                  className="badge"
                  style={{ fontSize: 10, color: ae.sensorKind === "piezo" ? "var(--caution)" : ae.live ? "var(--normal)" : "var(--muted)" }}
                >
                  {ae.sensorKind === "piezo" ? "추정" : ae.live ? "실시간" : "합성(데모)"}
                </span>
              </div>
              <div
                className="card"
                style={{ padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}
              >
                <span className={`badge badge--${sigRisk}`}>
                  <span className={`dot dot--${sigRisk}`} />
                  {SIGNAL_LABEL[ae.signalType] ?? ae.signalType}
                </span>
                <b style={{ flex: 1 }}>수신 {ae.amplitudeDbAe} dB · SNR {ae.snrDb} dB</b>
                <span className="muted">충격 {ae.hitCount}회</span>
              </div>
              <div className="kv">
                <div><span>수신 진폭</span><b>{ae.amplitudeDbAe} dB</b></div>
                <div><span>신호대잡음(SNR)</span><b>{ae.snrDb} dB</b></div>
                <div><span>충격 횟수</span><b>{ae.hitCount} 회</b></div>
                <div><span>신호 지속시간</span><b>{ae.durationMs} ms</b></div>
                <div><span>주파수 대역</span><b>{ae.freqLowKhz}–{ae.freqHighKhz} kHz</b></div>
                <div><span>배경 소음</span><b>{ae.ambientNoiseDb} dB</b></div>
                <div><span>강우</span><b>{ae.rainMmh} mm/h</b></div>
                <div><span>풍속</span><b>{ae.windMps} m/s</b></div>
                <div><span>크레인</span><b>{ae.craneActive ? "가동" : "정지"}</b></div>
              </div>
            </div>
          )}

          {!line.vesselId && (
            <div className="alert-msg" style={{ background: "var(--wire)", color: "var(--graphite)", borderColor: "var(--line)" }}>
              미계선 상태(접안 선박 없음) — 위험도는 항상 정상입니다.
            </div>
          )}

          {line.vesselId && line.sensorMode === "PENDING" && (
            <div className="alert-msg">
              이 계류삭에는 센서가 연결되지 않아 측정·위험 판정을 시작할 수 없습니다.
            </div>
          )}

          {line.vesselId && line.sensorMode === "DEVICE" && !event && (
            <div className="alert-msg" style={{ background: "var(--wire)", color: "var(--graphite)", borderColor: "var(--line)" }}>
              실센서 이벤트 수신 대기 중입니다. 목업 수치는 표시하지 않습니다.
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
