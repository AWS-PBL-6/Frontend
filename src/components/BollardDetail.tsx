import { useMemo, useState } from "react";
import { Cable, Pencil, Plus, Trash2, Unplug } from "lucide-react";
import { api } from "../lib/api";
import { effectiveRisk } from "../twin/palette";
import type { Bollard, LineStatus, RiskLevel, Vessel } from "../lib/types";

const RISK_LABEL: Record<RiskLevel, string> = {
  NORMAL: "정상",
  CAUTION: "주의",
  DANGER: "위험",
};
const MAX = 2;

/** Bollard detail side panel.
 *
 * Bollards are quay attachment/geometry assets only. Every piezo sensor is
 * owned by an individual mooring line and is managed from the line form/detail.
 */
export function BollardDetail({
  bollard,
  lines,
  vessels,
  readOnly = false,
  onClose,
  onEdit,
  onChanged,
  onOpenLine,
  onCreateLine,
}: {
  bollard: Bollard;
  lines: LineStatus[];
  vessels: Vessel[];
  readOnly?: boolean;
  onClose: () => void;
  onEdit: (b: Bollard) => void;
  onChanged: () => void;
  onOpenLine: (l: LineStatus) => void;
  onCreateLine: (b: Bollard) => void;
}) {
  const connected = useMemo(
    () => lines.filter((line) => line.bollardId === bollard.bollardId),
    [lines, bollard.bollardId],
  );
  const unconnected = useMemo(() => lines.filter((line) => !line.bollardId), [lines]);
  const [attaching, setAttaching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = connected.length >= MAX;

  const vesselName = (id?: string | null) =>
    id ? vessels.find((vessel) => vessel.vesselId === id)?.name ?? id : null;

  const run = async (fn: () => Promise<unknown>, fail: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : fail);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const attach = async (line: LineStatus) => {
    const ok = await run(
      () => api.updateLine(line.lineId, { bollardId: bollard.bollardId }),
      "계류삭 연결 실패",
    );
    if (ok) setAttaching(false);
  };

  const detach = (line: LineStatus) =>
    run(() => api.updateLine(line.lineId, { bollardId: null }), "연결 해제 실패");

  const del = async () => {
    if (!window.confirm(`${bollard.label || bollard.bollardId} 볼라드를 삭제할까요?`)) return;
    setBusy(true);
    try {
      await api.deleteBollard(bollard.bollardId);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패");
      setBusy(false);
    }
  };

  const picker = (
    <div className="card" style={{ padding: 12 }}>
      <div className="section-label">연결할 계류삭 선택 (미연결 계류삭만)</div>
      {unconnected.length === 0 && (
        <>
          <div className="muted">연결 가능한 미연결 계류삭이 없습니다.</div>
          {!readOnly && (
            <button
              className="btn btn-accent btn-block btn-icon"
              style={{ marginTop: 8 }}
              onClick={() => onCreateLine(bollard)}
            >
              <Plus size={14} /> 새 계류삭 추가 후 바로 연결
            </button>
          )}
        </>
      )}
      <div className="rail">
        {unconnected.map((line) => (
          <button key={line.lineId} className="rail-item" disabled={busy} onClick={() => attach(line)}>
            <span className="rail-id">{line.lineId}</span>
            <span className="muted" style={{ flex: 1 }}>{line.berthId}</span>
            <span className="muted">연결</span>
          </button>
        ))}
      </div>
      <button className="btn-sm" style={{ marginTop: 8 }} onClick={() => setAttaching(false)}>
        닫기
      </button>
    </div>
  );

  return (
    <>
      <div className="slideover-backdrop" onClick={onClose} />
      <aside className="slideover" role="dialog" aria-modal="true">
        <div className="slideover-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong>{bollard.label || bollard.bollardId}</strong>
            <span className="badge">볼라드 · 연결 지점</span>
          </div>
          <div className="slideover-actions">
            {!readOnly && (
              <>
                <button className="icon-btn icon-btn--act" disabled={busy} onClick={() => onEdit(bollard)} aria-label="수정" title="수정">
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-btn icon-btn--act icon-btn--danger"
                  disabled={busy || connected.length > 0}
                  onClick={del}
                  aria-label="삭제"
                  title={connected.length === 0 ? "삭제" : "연결된 계류삭을 먼저 해제하세요"}
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
            <button className="icon-btn" onClick={onClose} aria-label="닫기">×</button>
          </div>
        </div>

        <div className="slideover-body">
          {error && <div className="alert-msg">{error}</div>}
          <div className="card" style={{ padding: 12 }}>
            <b>센서는 볼라드가 아닌 각 계류삭에 부착됩니다</b>
            <p className="sensor-card-desc" style={{ marginBottom: 0 }}>
              선박 측 계류삭 연결 고리(아이·스플라이스 인근)의 피에조 센서는 계류삭 상세에서 관리하세요.
            </p>
          </div>

          <div className="kv">
            <div><span>볼라드 ID</span><b>{bollard.bollardId}</b></div>
            <div><span>선석 (Berth)</span><b>{bollard.berthId || "–"}</b></div>
            <div><span>안벽 위치</span><b>{bollard.positionM} m</b></div>
            <div><span>계류삭 연결</span><b>{connected.length}/{MAX}{full ? " 만석" : ""}</b></div>
          </div>

          <div>
            <div className="section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Cable size={13} /> 연결된 계류삭 ({connected.length}/{MAX})
            </div>
            <div className="rail">
              {connected.map((line) => {
                const risk = effectiveRisk(line);
                const moored = !!line.vesselId;
                return (
                  <div key={line.lineId} className="rail-item" style={{ cursor: "default" }}>
                    <span className={`dot dot--${risk}`} />
                    <button
                      className="rail-id"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", fontWeight: 600 }}
                      onClick={() => onOpenLine(line)}
                      title="계류삭·센서 상세"
                    >
                      {line.lineId}
                    </button>
                    <span className="muted" style={{ flex: 1 }}>
                      {line.sensorMode === "DEVICE" ? line.sensorId : line.sensorMode === "VIRTUAL" ? "시연 센서" : "센서 미연동"}
                      {moored ? ` · ${vesselName(line.vesselId)}` : " · 미계선"}
                    </span>
                    <span className={`badge badge--${risk}`}>{RISK_LABEL[risk]}</span>
                    {!readOnly && (
                      <button
                        className="icon-btn icon-btn--act"
                        disabled={busy || moored}
                        onClick={() => detach(line)}
                        aria-label="연결 해제"
                        title={moored ? "계선 중에는 해제 불가 — 출항 처리 먼저" : "연결 해제"}
                      >
                        <Unplug size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
              {connected.length === 0 && <div className="muted">연결된 계류삭이 없습니다.</div>}
            </div>

            {!readOnly && !full && (
              unconnected.length === 0 ? (
                <button className="btn btn-accent btn-block btn-icon" style={{ marginTop: 10 }} disabled={busy} onClick={() => onCreateLine(bollard)}>
                  <Plus size={14} /> 새 계류삭 추가 후 바로 연결
                </button>
              ) : attaching ? picker : (
                <button className="btn btn-ghost btn-block btn-icon" style={{ marginTop: 10 }} disabled={busy} onClick={() => setAttaching(true)}>
                  <Plus size={14} /> 계류삭 연결
                </button>
              )
            )}
          </div>

          <div className="muted" style={{ fontSize: 11, marginTop: "auto" }}>
            {bollard.bollardId} · 갱신 {bollard.updatedAt}
          </div>
        </div>
      </aside>
    </>
  );
}
