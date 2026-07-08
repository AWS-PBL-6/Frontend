import { useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal";
import { api, type LineInput } from "../lib/api";
import type { Bollard, LineStatus, RiskLevel, Vessel } from "../lib/types";

const MAX_LINES_PER_BOLLARD = 2;

export function LineForm({
  existing,
  presetVesselId,
  onClose,
  onSaved,
}: {
  existing?: LineStatus | null;
  presetVesselId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const edit = !!existing;
  const [lineId, setLineId] = useState(existing?.lineId ?? "");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(existing?.riskLevel ?? "NORMAL");
  const [bollardId, setBollardId] = useState(existing?.bollardId ?? "");
  const [vesselId, setVesselId] = useState(existing?.vesselId ?? presetVesselId ?? "");
  const [bollards, setBollards] = useState<Bollard[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [lines, setLines] = useState<LineStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listBollards().then(setBollards).catch(() => setBollards([]));
    api.listVessels().then(setVessels).catch(() => setVessels([]));
    api.listLines().then(setLines).catch(() => setLines([]));
  }, []);

  // How many lines already occupy each bollard (excluding the line being edited).
  const countByBollard = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of lines) {
      if (!l.bollardId || (existing && l.lineId === existing.lineId)) continue;
      m[l.bollardId] = (m[l.bollardId] ?? 0) + 1;
    }
    return m;
  }, [lines, existing]);

  // A line is fixed to its bollard, so Site/Berth are inherited from it.
  const selectedBollard = useMemo(
    () => bollards.find((b) => b.bollardId === bollardId) ?? null,
    [bollards, bollardId],
  );
  const derivedSite = selectedBollard?.siteId ?? existing?.siteId ?? "yard-a";
  const derivedBerth = selectedBollard?.berthId ?? existing?.berthId ?? "berth-01";

  const submit = async () => {
    setBusy(true);
    setError(null);
    const body: LineInput = {
      siteId: derivedSite,
      berthId: derivedBerth,
      riskLevel,
      bollardId: bollardId || null,
      vesselId: vesselId || null,
    };
    try {
      if (edit && existing) await api.updateLine(existing.lineId, body);
      // lineId is optional — omit it entirely so the backend auto-generates one.
      else await api.createLine(lineId.trim() ? { ...body, lineId: lineId.trim() } : body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={edit ? "계류삭 수정" : "계류삭 추가"}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-accent"
            style={{ flex: 1 }}
            disabled={busy}
            onClick={submit}
          >
            {busy ? "저장 중…" : "저장"}
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            취소
          </button>
        </>
      }
    >
      {error && <div className="alert-msg">{error}</div>}
      <div className="field-light">
        <label>라인 ID {edit ? "" : "(선택)"}</label>
        <input
          className="input-light"
          value={lineId}
          disabled={edit}
          onChange={(e) => setLineId(e.target.value)}
          placeholder={edit ? "" : "미입력 시 자동 생성 (mooring-…)"}
        />
      </div>
      <div className="field-light">
        <label>소속 볼라드 (센서 위치·고정)</label>
        <select
          className="select-light"
          value={bollardId}
          onChange={(e) => setBollardId(e.target.value)}
        >
          <option value="">— 미지정 —</option>
          {bollards.map((b) => {
            const count = countByBollard[b.bollardId] ?? 0;
            const full = count >= MAX_LINES_PER_BOLLARD && b.bollardId !== bollardId;
            return (
              <option key={b.bollardId} value={b.bollardId} disabled={full}>
                {(b.label || b.bollardId)} · {b.berthId} · {count}/{MAX_LINES_PER_BOLLARD}
                {full ? " 만석" : ""}
              </option>
            );
          })}
        </select>
        <span className="muted" style={{ fontSize: 11 }}>
          선석/사이트는 볼라드에서 자동: <b>{derivedBerth}</b> · {derivedSite}
        </span>
      </div>
      <div className="field-light">
        <label>위험도</label>
        <select
          className="select-light"
          value={riskLevel}
          onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}
        >
          <option value="NORMAL">정상</option>
          <option value="CAUTION">주의</option>
          <option value="DANGER">위험</option>
        </select>
      </div>
      <div className="field-light">
        <label>계선 선박 (접안 세션 · 보통 접안/출항으로 자동 설정)</label>
        <select
          className="select-light"
          value={vesselId}
          onChange={(e) => setVesselId(e.target.value)}
        >
          <option value="">— 미계선 —</option>
          {vessels.map((v) => (
            <option key={v.vesselId} value={v.vesselId}>
              {v.name} ({v.vesselId})
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}
