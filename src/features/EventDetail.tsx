import { Suspense, lazy, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { EventRecord, EventWorkflowStatus, RiskLevel } from "../lib/types";

const RopeScene = lazy(() => import("./RopeScene"));

const RISK_COLOR: Record<RiskLevel, string> = {
  NORMAL: "var(--normal)",
  CAUTION: "var(--caution)",
  DANGER: "var(--danger)",
};
const RISK_LABEL: Record<RiskLevel, string> = { NORMAL: "정상", CAUTION: "주의", DANGER: "위험" };
const WORKFLOW_LABEL: Record<EventWorkflowStatus, string> = {
  NEW: "신규",
  ACKNOWLEDGED: "확인",
  IN_PROGRESS: "조치 중",
  RESOLVED: "처리 완료",
  FALSE_POSITIVE: "오탐 종결",
};

function fmt(v: number | undefined): string {
  return v === undefined || Number.isNaN(v) ? "–" : String(v);
}
function asNum(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

export function EventDetail({
  eventId,
  onClose,
  onChanged,
}: {
  eventId: string;
  onClose: () => void;
  onChanged?: (e: EventRecord) => void;
}) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState<EventWorkflowStatus>("NEW");
  const [workflowNote, setWorkflowNote] = useState("");
  const [handledBy, setHandledBy] = useState("");

  useEffect(() => {
    let alive = true;
    setEvent(null);
    setError(null);
    api
      .getEvent(eventId)
      .then((e) => {
        if (!alive) return;
        setEvent(e);
        setWorkflowStatus(e.workflowStatus ?? "NEW");
        setWorkflowNote(e.workflowNote ?? "");
        setHandledBy(e.handledBy ?? "");
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "조회 실패"));
    return () => {
      alive = false;
    };
  }, [eventId]);

  const ack = async () => {
    if (!event) return;
    setBusy(true);
    try {
      const updated = await api.ackEvent(event.eventId);
      setEvent(updated);
      setWorkflowStatus(updated.workflowStatus ?? "ACKNOWLEDGED");
      setWorkflowNote(updated.workflowNote ?? "");
      setHandledBy(updated.handledBy ?? "");
      onChanged?.(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "확인 실패");
    } finally {
      setBusy(false);
    }
  };

  const saveWorkflow = async () => {
    if (!event) return;
    setBusy(true);
    try {
      const updated = await api.setEventWorkflow(event.eventId, {
        workflowStatus,
        workflowNote: workflowNote.trim() || null,
        handledBy: handledBy.trim() || null,
      });
      setEvent(updated);
      onChanged?.(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "상태 저장 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="slideover-backdrop" onClick={onClose} />
      <aside className="slideover" role="dialog" aria-modal="true">
        <div className="slideover-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong>{event?.lineId ?? "이벤트"}</strong>
            {event && (
              <span className={`badge badge--${event.riskLevel}`}>
                <span className={`dot dot--${event.riskLevel}`} />
                {RISK_LABEL[event.riskLevel]} · {event.riskScore.toFixed(2)}
              </span>
            )}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="slideover-body">
          {error && <div className="alert-msg">{error}</div>}
          {!event && !error && (
            <div className="center" style={{ height: 120 }}>
              <div className="spin" />
            </div>
          )}
          {event && (
            <>
              <div className="rope-canvas">
                <span className="rope-tag">three.js · 실시간 홋줄 상태</span>
                <Suspense
                  fallback={
                    <div className="center" style={{ height: "100%" }}>
                      <div className="spin" />
                    </div>
                  }
                >
                  <RopeScene risk={event.riskLevel} />
                </Suspense>
              </div>

              <div className="prob">
                {(["NORMAL", "CAUTION", "DANGER"] as RiskLevel[]).map((k) => (
                  <div className="prob-row" key={k}>
                    <span className="lab">{RISK_LABEL[k]}</span>
                    <span className="prob-track">
                      <i
                        style={{
                          width: `${Math.round((event.classProbabilities[k] ?? 0) * 100)}%`,
                          background: RISK_COLOR[k],
                        }}
                      />
                    </span>
                    <span className="rail-score">
                      {((event.classProbabilities[k] ?? 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>

              <div className="card" style={{ padding: "12px 14px" }}>
                <div className="section-label">운영 상태</div>
                <div className="kv">
                  <div><span>처리 상태</span><b>{WORKFLOW_LABEL[event.workflowStatus ?? "NEW"]}</b></div>
                  <div><span>확인 상태</span><b>{event.acknowledged ? "확인 완료 (Ack)" : "미확인"}</b></div>
                  <div>
                    <span>알림 전파</span>
                    <b>{event.riskLevel === "DANGER" ? (event.alertMessage ? "WebSocket + SNS" : "WebSocket · SNS 대상") : "WebSocket"}</b>
                  </div>
                  <div><span>담당자</span><b>{event.handledBy || "–"}</b></div>
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                  Ack는 확인 기록이고, 처리 완료/오탐 종결은 별도 처리 상태로 남깁니다.
                </div>
              </div>

              <div className="card" style={{ padding: "12px 14px" }}>
                <div className="section-label">처리 상태 변경</div>
                <div className="form-row">
                  <div className="field-light">
                    <label>상태</label>
                    <select
                      className="select-light"
                      value={workflowStatus}
                      onChange={(e) => setWorkflowStatus(e.target.value as EventWorkflowStatus)}
                    >
                      {(["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "FALSE_POSITIVE"] as EventWorkflowStatus[]).map((status) => (
                        <option key={status} value={status}>
                          {WORKFLOW_LABEL[status]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field-light">
                    <label>담당자</label>
                    <input className="input-light" value={handledBy} onChange={(e) => setHandledBy(e.target.value)} />
                  </div>
                </div>
                <div className="field-light">
                  <label>처리 메모</label>
                  <textarea className="input-light" rows={3} value={workflowNote} onChange={(e) => setWorkflowNote(e.target.value)} />
                </div>
                <button className="btn btn-ghost btn-block" disabled={busy} onClick={saveWorkflow}>
                  처리 상태 저장
                </button>
              </div>

              <div className="kv">
                <div><span>peakAmplitude</span><b>{fmt(event.features.peakAmplitude)}</b></div>
                <div><span>energy</span><b>{fmt(event.features.energy)}</b></div>
                <div><span>dominantFreq (Hz)</span><b>{fmt(event.features.dominantFrequencyHz)}</b></div>
                <div><span>tension (kN)</span><b>{fmt(asNum(event.context.tensionEstimateKn))}</b></div>
              </div>

              {event.snapbackZone && (
                <div className="card" style={{ padding: "12px 14px" }}>
                  <div className="section-label">스냅백 위험구역</div>
                  <div>
                    <b style={{ fontSize: 18 }}>{event.snapbackZone.radiusMeters} m</b>{" "}
                    <span className="muted">반경 · {event.snapbackZone.polygon.length}점 폴리곤</span>
                  </div>
                </div>
              )}

              {event.alertMessage && <div className="alert-msg">{event.alertMessage}</div>}

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-accent"
                  style={{ flex: 1 }}
                  onClick={ack}
                  disabled={busy || event.acknowledged}
                >
                  {event.acknowledged ? "확인됨" : busy ? "처리 중…" : "경보 확인(Ack)"}
                </button>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
                  닫기
                </button>
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                {event.eventId} · model {event.modelVersion} · {event.createdAt}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
