import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { api, type LineInput } from "../lib/api";
import type { LineStatus, RiskLevel, Vessel } from "../lib/types";

export function LineForm({
  existing,
  onClose,
  onSaved,
}: {
  existing?: LineStatus | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const edit = !!existing;
  const [lineId, setLineId] = useState(existing?.lineId ?? "");
  const [siteId, setSiteId] = useState(existing?.siteId ?? "yard-a");
  const [berthId, setBerthId] = useState(existing?.berthId ?? "berth-01");
  const [anchorX, setAnchorX] = useState(existing?.layout.anchorX ?? 150);
  const [anchorY, setAnchorY] = useState(existing?.layout.anchorY ?? 100);
  const [headingDeg, setHeadingDeg] = useState(existing?.layout.headingDeg ?? 130);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(existing?.riskLevel ?? "NORMAL");
  const [vesselId, setVesselId] = useState(existing?.vesselId ?? "");
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listVessels().then(setVessels).catch(() => setVessels([]));
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const body: LineInput = {
      siteId,
      berthId,
      layout: { anchorX: Number(anchorX), anchorY: Number(anchorY), headingDeg: Number(headingDeg) },
      riskLevel,
      vesselId: vesselId || null,
    };
    try {
      if (edit && existing) await api.updateLine(existing.lineId, body);
      else await api.createLine({ ...body, lineId });
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
            disabled={busy || (!edit && !lineId)}
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
        <label>라인 ID</label>
        <input
          className="input-light"
          value={lineId}
          disabled={edit}
          onChange={(e) => setLineId(e.target.value)}
          placeholder="mooring-05"
        />
      </div>
      <div className="form-row">
        <div className="field-light">
          <label>Site</label>
          <input className="input-light" value={siteId} onChange={(e) => setSiteId(e.target.value)} />
        </div>
        <div className="field-light">
          <label>Berth</label>
          <input className="input-light" value={berthId} onChange={(e) => setBerthId(e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="field-light">
          <label>anchorX</label>
          <input className="input-light" type="number" value={anchorX} onChange={(e) => setAnchorX(Number(e.target.value))} />
        </div>
        <div className="field-light">
          <label>anchorY</label>
          <input className="input-light" type="number" value={anchorY} onChange={(e) => setAnchorY(Number(e.target.value))} />
        </div>
        <div className="field-light">
          <label>heading°</label>
          <input className="input-light" type="number" value={headingDeg} onChange={(e) => setHeadingDeg(Number(e.target.value))} />
        </div>
      </div>
      <div className="form-row">
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
          <label>소속 선박 (센서 부착)</label>
          <select
            className="select-light"
            value={vesselId}
            onChange={(e) => setVesselId(e.target.value)}
          >
            <option value="">— 미지정 —</option>
            {vessels.map((v) => (
              <option key={v.vesselId} value={v.vesselId}>
                {v.name} ({v.vesselId})
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}
