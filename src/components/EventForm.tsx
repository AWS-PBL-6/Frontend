import { useState } from "react";
import { Modal } from "./Modal";
import { api } from "../lib/api";
import type { LineStatus, RiskLevel } from "../lib/types";

export function EventForm({
  lines,
  onClose,
  onSaved,
}: {
  lines: LineStatus[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [lineId, setLineId] = useState(lines[0]?.lineId ?? "");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("CAUTION");
  const [riskScore, setRiskScore] = useState(0.5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createEvent({ lineId, riskLevel, riskScore: Number(riskScore) });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="이벤트 생성 (수동)"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-accent" style={{ flex: 1 }} disabled={busy || !lineId} onClick={submit}>
            {busy ? "생성 중…" : "생성"}
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            취소
          </button>
        </>
      }
    >
      {error && <div className="alert-msg">{error}</div>}
      <div className="field-light">
        <label>라인</label>
        <select className="select-light" value={lineId} onChange={(e) => setLineId(e.target.value)}>
          {lines.length === 0 && <option value="">(라인 없음)</option>}
          {lines.map((l) => (
            <option key={l.lineId} value={l.lineId}>
              {l.lineId}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <div className="field-light">
          <label>위험도</label>
          <select
            className="select-light"
            value={riskLevel}
            onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}
          >
            <option value="CAUTION">주의</option>
            <option value="DANGER">위험</option>
          </select>
        </div>
        <div className="field-light">
          <label>riskScore (0–1)</label>
          <input
            className="input-light"
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={riskScore}
            onChange={(e) => setRiskScore(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        수동 생성 이벤트는 ML 파이프라인을 거치지 않습니다(modelVersion: manual).
      </div>
    </Modal>
  );
}
