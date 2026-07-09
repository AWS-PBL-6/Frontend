import { useMemo, useState } from "react";
import { Cable, Cpu, Pencil, Plus, Trash2, Unplug } from "lucide-react";
import { api } from "../lib/api";
import { effectiveRisk } from "../twin/palette";
import type { Bollard, LineStatus, RiskLevel, Vessel } from "../lib/types";

const RISK_LABEL: Record<RiskLevel, string> = { NORMAL: "정상", CAUTION: "주의", DANGER: "위험" };
const MAX = 2;

/** Bollard detail side panel.
 *
 *  Two clearly separated concerns:
 *  1. 센서 연동 (one-time onboarding) — a new bollard must first bind a real
 *     AE sensor (DEVICE) or opt into 가상 모드 (VIRTUAL). Only VIRTUAL→DEVICE
 *     may follow later.
 *  2. 계류삭 연결 (operational) — in either mode, lines not connected to any
 *     bollard can be attached freely; attached lines can be detached unless a
 *     vessel is currently moored on them.
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
  // 연결 대상은 "어느 볼라드에도 연결되지 않은" 계류삭뿐.
  const unconnected = useMemo(() => lines.filter((l) => !l.bollardId), [lines]);
  const [attaching, setAttaching] = useState(false);
  const [binding, setBinding] = useState(false); // 실센서 연동/전환 입력창
  const [sensorId, setSensorId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provisioned = bollard.sensorMode !== "PENDING";
  const full = connected.length >= MAX;

  const vesselName = (id?: string | null) =>
    id ? vessels.find((v) => v.vesselId === id)?.name ?? id : null;

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

  const bindDevice = async () => {
    if (!sensorId.trim()) {
      setError("센서 장비 ID를 입력하세요.");
      return;
    }
    const ok = await run(
      () => api.provisionBollard(bollard.bollardId, { sensorMode: "DEVICE", sensorId: sensorId.trim() }),
      "센서 연동 실패",
    );
    if (ok) {
      setBinding(false);
      setSensorId("");
    }
  };

  const bindVirtual = () =>
    run(() => api.provisionBollard(bollard.bollardId, { sensorMode: "VIRTUAL" }), "가상 모드 설정 실패");

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
  // Backend refuses deletion while lines are attached (BOLLARD_IN_USE).
  const deletable = connected.length === 0;

  /* ── 1. 센서 연동 상태 카드 (1회 온보딩) ────────────────────────────── */
  const deviceIdInput = (
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
      <input
        className="input-light"
        value={sensorId}
        onChange={(e) => setSensorId(e.target.value)}
        placeholder="센서 장비 ID (예: ae-0013)"
        disabled={busy}
      />
      <button className="btn-sm" disabled={busy} onClick={bindDevice}>
        연동
      </button>
      <button className="btn-sm" disabled={busy} onClick={() => setBinding(false)}>
        취소
      </button>
    </div>
  );

  const sensorCard = (
    <div className={`sensor-card sensor-card--${bollard.sensorMode}`}>
      <div className="sensor-card-head">
        <Cpu size={15} />
        <b>
          {bollard.sensorMode === "DEVICE" && "실센서 연동됨"}
          {bollard.sensorMode === "VIRTUAL" && "가상 모드 (시뮬레이션)"}
          {bollard.sensorMode === "PENDING" && "센서 미연동"}
        </b>
        <span className="sensor-card-meta">
          {bollard.sensorMode === "DEVICE" && `${bollard.sensorId ?? "–"}`}
          {bollard.sensorBoundAt ? ` · ${bollard.sensorBoundAt.slice(0, 10)}` : ""}
        </span>
      </div>
      {bollard.sensorMode === "PENDING" && (
        <>
          <p className="sensor-card-desc">
            첫 1회 센서 연동이 필요합니다. 실센서를 연동하거나 가상 모드로 시작하세요.
            연동 전에는 계류삭을 연결할 수 없습니다.
          </p>
          {!readOnly &&
            (binding ? (
              deviceIdInput
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn btn-accent" style={{ flex: 1 }} disabled={busy} onClick={() => setBinding(true)}>
                  실센서 연동
                </button>
                <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={bindVirtual}>
                  가상 모드로 시작
                </button>
              </div>
            ))}
        </>
      )}
      {bollard.sensorMode === "VIRTUAL" && !readOnly && (
        <>
          <p className="sensor-card-desc">시뮬레이션 데이터로 동작 중 — 실물 센서 설치 시 전환하세요.</p>
          {binding ? (
            deviceIdInput
          ) : (
            <button className="btn-sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => setBinding(true)}>
              실센서로 전환
            </button>
          )}
        </>
      )}
    </div>
  );

  /* ── 2. 계류삭 연결 (운영 · 수시) ───────────────────────────────────── */
  const picker = (
    <div className="card" style={{ padding: 12 }}>
      <div className="section-label">연결할 계류삭 선택 (미연결 계류삭만)</div>
      {unconnected.length === 0 && <div className="muted">연결 가능한 미연결 계류삭이 없습니다.</div>}
      <div className="rail">
        {unconnected.map((l) => (
          <button key={l.lineId} className="rail-item" disabled={busy} onClick={() => attach(l)}>
            <span className="rail-id">{l.lineId}</span>
            <span className="muted" style={{ flex: 1 }}>{l.berthId}</span>
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
                  disabled={busy || !deletable}
                  onClick={del}
                  aria-label="삭제"
                  title={deletable ? "삭제" : "연결된 계류삭을 먼저 해제하세요"}
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

          {sensorCard}

          <div className="kv">
            <div><span>볼라드 ID</span><b>{bollard.bollardId}</b></div>
            <div><span>선석 (Berth)</span><b>{bollard.berthId || "–"}</b></div>
            <div><span>안벽 위치</span><b>{bollard.positionM} m</b></div>
            <div><span>계류삭 연결</span><b>{connected.length}/{MAX}{full ? " 만석" : ""}</b></div>
          </div>

          {provisioned ? (
            <div>
              <div className="section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Cable size={13} /> 연결된 계류삭 ({connected.length}/{MAX})
              </div>
              <div className="rail">
                {connected.map((l) => {
                  const risk = effectiveRisk(l);
                  const moored = !!l.vesselId;
                  return (
                    <div key={l.lineId} className="rail-item" style={{ cursor: "default" }}>
                      <span className={`dot dot--${risk}`} />
                      <button
                        className="rail-id"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", fontWeight: 600 }}
                        onClick={() => onOpenLine(l)}
                        title="계류삭 상세"
                      >
                        {l.lineId}
                      </button>
                      <span className="muted" style={{ flex: 1 }}>
                        {moored ? vesselName(l.vesselId) : "미계선"}
                      </span>
                      <span className={`badge badge--${risk}`}>{RISK_LABEL[risk]}</span>
                      {!readOnly && (
                        <button
                          className="icon-btn icon-btn--act"
                          disabled={busy || moored}
                          onClick={() => detach(l)}
                          aria-label="연결 해제"
                          title={moored ? "계선 중에는 해제 불가 — 출항 처리 먼저" : "연결 해제"}
                        >
                          <Unplug size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {connected.length === 0 && (
                  <div className="muted" style={{ padding: "6px 0" }}>
                    연결된 계류삭이 없습니다.
                  </div>
                )}
              </div>
              {!readOnly &&
                !full &&
                (attaching ? (
                  picker
                ) : (
                  <button
                    className="btn btn-ghost btn-block btn-icon"
                    style={{ marginTop: 10 }}
                    disabled={busy}
                    onClick={() => setAttaching(true)}
                  >
                    <Plus size={14} /> 계류삭 연결
                  </button>
                ))}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12.5 }}>
              센서 연동 후 계류삭을 연결할 수 있습니다.
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
