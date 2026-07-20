import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Settings } from "lucide-react";
import { api } from "../lib/api";
import { setPiezoBands } from "../lib/piezo";
import type { PiezoBandSettings } from "../lib/types";

function fmtDate(value?: string | null): string {
  return value ? value.replace("T", " ").slice(0, 19) : "기본값 (변경 이력 없음)";
}

const FIELDS = [
  { key: "minActiveHz", label: "유휴 상한 (Hz)", hint: "이 값 미만은 유휴 대역 — 실시간 표시만, 판정 없음" },
  { key: "normalMaxHz", label: "정상 상한 (Hz)", hint: "이 값 미만은 정상(NORMAL)" },
  { key: "cautionMaxHz", label: "주의 상한 (Hz)", hint: "이 값 미만은 주의(CAUTION), 이상은 위험(DANGER)" },
] as const;

export function SettingsManage() {
  const [bands, setBands] = useState<PiezoBandSettings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPiezoBands()
      .then((value) => {
        setBands(value);
        setForm({
          minActiveHz: String(value.minActiveHz),
          normalMaxHz: String(value.normalMaxHz),
          cautionMaxHz: String(value.cautionMaxHz),
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "설정 조회 실패"));
  }, []);

  const parsed = useMemo(() => {
    const min = Number(form.minActiveHz);
    const normal = Number(form.normalMaxHz);
    const caution = Number(form.cautionMaxHz);
    const valid =
      [min, normal, caution].every((v) => Number.isFinite(v) && v >= 0)
      && min <= normal
      && normal <= caution
      && caution > 0;
    return { min, normal, caution, valid };
  }, [form]);

  const save = async () => {
    if (!parsed.valid) {
      setError("유휴 상한 ≤ 정상 상한 ≤ 주의 상한 순서의 0 이상 숫자여야 합니다.");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updatePiezoBands({
        minActiveHz: parsed.min,
        normalMaxHz: parsed.normal,
        cautionMaxHz: parsed.caution,
      });
      setBands(updated);
      setPiezoBands(updated); // 화면의 대역 표시도 즉시 일치시킨다
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>
            <Settings size={18} style={{ verticalAlign: -3 }} /> 환경 설정 — 위험 판정 대역
          </h2>
          <div className="muted" style={{ fontSize: 12 }}>
            센서 진동 주파수(Hz)별 정상 · 주의 · 위험 판정 구간을 설정합니다. 저장 즉시 이후
            모든 판독에 적용되며, 경보(이메일 · SMS) 발송 기준도 함께 바뀝니다.
          </div>
        </div>
      </div>

      {error && <div className="banner-danger">{error}</div>}
      {saved && !error && (
        <div className="muted" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <CheckCircle2 size={14} /> 저장됨 — 새 판독부터 적용됩니다.
        </div>
      )}

      {!bands ? (
        <div className="center" style={{ padding: 40 }}>
          <div className="spin" />
        </div>
      ) : (
        <>
          <div className="form-row" style={{ maxWidth: 720 }}>
            {FIELDS.map(({ key, label, hint }) => (
              <div className="field-light" key={key}>
                <label>{label}</label>
                <input
                  className="input-light"
                  type="number"
                  min={0}
                  step={0.5}
                  value={form[key] ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                />
                <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{hint}</div>
              </div>
            ))}
          </div>

          <div className="muted" style={{ fontSize: 13, margin: "14px 0" }}>
            {parsed.valid ? (
              <>
                미리보기: 유휴 <strong>&lt; {parsed.min} Hz</strong> · 정상{" "}
                <strong>{parsed.min} ~ {parsed.normal} Hz 미만</strong> · 주의{" "}
                <strong>{parsed.normal} ~ {parsed.caution} Hz 미만</strong> · 위험{" "}
                <strong>{parsed.caution} Hz 이상</strong>
              </>
            ) : (
              <span style={{ color: "#c0392b" }}>
                유휴 상한 ≤ 정상 상한 ≤ 주의 상한 순서의 0 이상 숫자를 입력하세요.
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn btn-accent" disabled={busy || !parsed.valid} onClick={save}>
              {busy ? "저장 중…" : "저장"}
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              최근 변경: {fmtDate(bands.updatedAt)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
