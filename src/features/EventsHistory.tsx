import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../lib/api";
import { EventDetail } from "./EventDetail";
import { EventForm } from "../components/EventForm";
import type { EventRecord, LiveData, RiskLevel } from "../lib/types";

const RISK_LABEL: Record<RiskLevel, string> = { NORMAL: "정상", CAUTION: "주의", DANGER: "위험" };

export function EventsHistory() {
  const { lines } = useOutletContext<LiveData>();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [lineId, setLineId] = useState("");
  const [riskLevel, setRiskLevel] = useState<"" | RiskLevel>("");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const e = await api.listEvents({
        lineId: lineId || undefined,
        riskLevel: riskLevel || undefined,
        limit: 100,
      });
      setEvents(e);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [lineId, riskLevel]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (ev: EventRecord) => {
    if (!window.confirm(`이벤트 ${ev.eventId} 를 삭제할까요?`)) return;
    try {
      await api.deleteEvent(ev.eventId);
      setEvents((prev) => prev.filter((e) => e.eventId !== ev.eventId));
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>이벤트 이력</h2>
        <button className="btn btn-accent" onClick={() => setCreating(true)}>
          + 이벤트 생성
        </button>
      </div>

      <div className="filters">
        <select className="select" value={lineId} onChange={(e) => setLineId(e.target.value)}>
          <option value="">전체 라인</option>
          {lines.map((l) => (
            <option key={l.lineId} value={l.lineId}>
              {l.lineId}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={riskLevel}
          onChange={(e) => setRiskLevel(e.target.value as "" | RiskLevel)}
        >
          <option value="">전체 위험도</option>
          <option value="DANGER">위험</option>
          <option value="CAUTION">주의</option>
          <option value="NORMAL">정상</option>
        </select>
      </div>

      {error && <div className="banner-danger">{error}</div>}

      {loading ? (
        <div className="center" style={{ padding: 40 }}>
          <div className="spin" />
        </div>
      ) : (
        <div className="rail">
          {events.map((ev) => (
            <div className="evt-row" key={ev.eventId}>
              <span className="t">{ev.createdAt.replace("T", " ").slice(0, 19)}</span>
              <span className={`dot dot--${ev.riskLevel}`} />
              <strong>{ev.lineId}</strong>
              <span className="muted">
                {RISK_LABEL[ev.riskLevel]} · {ev.riskScore.toFixed(2)}
              </span>
              <span className="muted">{ev.acknowledged ? "확인됨" : "미확인"}</span>
              <span className="row-actions">
                <button className="btn-sm" onClick={() => setSelected(ev.eventId)}>
                  상세
                </button>
                <button className="btn-sm btn-danger" onClick={() => remove(ev)}>
                  삭제
                </button>
              </span>
            </div>
          ))}
          {events.length === 0 && <div className="muted">이벤트가 없습니다.</div>}
        </div>
      )}

      {selected && (
        <EventDetail
          eventId={selected}
          onClose={() => setSelected(null)}
          onChanged={(u) => setEvents((prev) => prev.map((e) => (e.eventId === u.eventId ? u : e)))}
        />
      )}
      {creating && (
        <EventForm
          lines={lines}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </div>
  );
}
