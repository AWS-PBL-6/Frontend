import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { effectiveRisk } from "../twin/palette";
import type { Bollard, LineStatus, RiskLevel, Vessel } from "../lib/types";

const RISK_LABEL: Record<RiskLevel, string> = { NORMAL: "정상", CAUTION: "주의", DANGER: "위험" };
const MAX = 2;

/** Bollard detail side panel: fixed shore asset info + its attached sensor
 *  lines, with edit/delete. An empty bollard shows a centred "볼라드 센서 매핑"
 *  action to bind an unmapped sensor line to it. */
export function BollardDetail({
  bollard,
  lines,
  vessels,
  readOnly = false,
  onClose,
  onEdit,
  onChanged,
  onOpenLine,
}: {
  bollard: Bollard;
  lines: LineStatus[];
  vessels: Vessel[];
  readOnly?: boolean;
  onClose: () => void;
  onEdit: (b: Bollard) => void;
  onChanged: () => void;
  onOpenLine: (l: LineStatus) => void;
}) {
  const connected = useMemo(
    () => lines.filter((l) => l.bollardId === bollard.bollardId),
    [lines, bollard.bollardId],
  );
  const unmapped = useMemo(() => lines.filter((l) => !l.bollardId), [lines]);
  const [mapping, setMapping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = connected.length >= MAX;

  const vesselName = (id?: string | null) =>
    id ? vessels.find((v) => v.vesselId === id)?.name ?? id : null;

  const mapSensor = async (line: LineStatus) => {
    setBusy(true);
    setError(null);
    try {
      await api.updateLine(line.lineId, { bollardId: bollard.bollardId });
      setMapping(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "매핑 실패");
    } finally {
      setBusy(false);
    }
  };

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
      <div className="section-label">연동할 센서(계류삭) 선택</div>
      {unmapped.length === 0 && <div className="muted">매핑 가능한 미배정 센서가 없습니다.</div>}
      <div className="rail">
        {unmapped.map((l) => (
          <button key={l.lineId} className="rail-item" disabled={busy} onClick={() => mapSensor(l)}>
            <span className="rail-id">{l.lineId}</span>
            <span className="muted" style={{ flex: 1 }}>{l.berthId}</span>
            <span className="muted">연결</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div className="slideover-backdrop" onClick={onClose} />
      <aside className="slideover" role="dialog" aria-modal="true">
        <div className="slideover-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong>{bollard.label || bollard.bollardId}</strong>
            <span className="badge">볼라드</span>
          </div>
          <div className="slideover-actions">
            {!readOnly && (
              <>
                <button
                  className="icon-btn icon-btn--act"
                  disabled={busy}
                  onClick={() => onEdit(bollard)}
                  aria-label="수정"
                  title="수정"
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-btn icon-btn--act icon-btn--danger"
                  disabled={busy}
                  onClick={del}
                  aria-label="삭제"
                  title="삭제"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
            <button className="icon-btn" onClick={onClose} aria-label="닫기">
              ×
            </button>
          </div>
        </div>
        <div className="slideover-body">
          {error && <div className="alert-msg">{error}</div>}

          <div className="kv">
            <div><span>볼라드 ID</span><b>{bollard.bollardId}</b></div>
            <div><span>선석 (Berth)</span><b>{bollard.berthId || "–"}</b></div>
            <div><span>안벽 위치</span><b>{bollard.positionM} m</b></div>
            <div><span>연결 라인</span><b>{connected.length}/{MAX}{full ? " 만석" : ""}</b></div>
          </div>

          {connected.length > 0 ? (
            <div>
              <div className="section-label">연결된 계류삭</div>
              <div className="rail">
                {connected.map((l) => {
                  const risk = effectiveRisk(l);
                  return (
                    <button key={l.lineId} className="rail-item" onClick={() => onOpenLine(l)}>
                      <span className={`dot dot--${risk}`} />
                      <span className="rail-id">{l.lineId}</span>
                      <span className="muted" style={{ flex: 1 }}>
                        {l.vesselId ? vesselName(l.vesselId) : "미계선"}
                      </span>
                      <span className={`badge badge--${risk}`}>{RISK_LABEL[risk]}</span>
                    </button>
                  );
                })}
              </div>
              {!readOnly &&
                !full &&
                (mapping ? (
                  picker
                ) : (
                  <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setMapping(true)}>
                    + 센서 매핑
                  </button>
                ))}
            </div>
          ) : !readOnly && mapping ? (
            picker
          ) : (
            <div className="center" style={{ flexDirection: "column", gap: 12, padding: "36px 0" }}>
              <div className="muted">이 볼라드에 연동된 센서가 없습니다.</div>
              {!readOnly && (
                <button className="btn btn-accent" onClick={() => setMapping(true)}>
                  볼라드 센서 매핑
                </button>
              )}
            </div>
          )}

          <div className="muted" style={{ fontSize: 11, marginTop: "auto" }}>
            {bollard.bollardId} · 갱신 {bollard.updatedAt}
          </div>
        </div>
      </aside>
    </>
  );
}
