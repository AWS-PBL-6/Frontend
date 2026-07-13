import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, MessageSquare, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { Modal } from "../components/Modal";
import { api, type SmsRecipientInput } from "../lib/api";
import type { SmsRecipient } from "../lib/types";

function fmtDate(value?: string | null): string {
  return value ? value.replace("T", " ").slice(0, 19) : "–";
}

function RecipientForm({
  existing,
  onClose,
  onSaved,
}: {
  existing?: SmsRecipient | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const edit = !!existing;
  const [name, setName] = useState(existing?.name ?? "");
  const [phoneNumber, setPhoneNumber] = useState(existing?.phoneNumber ?? "");
  const [siteId, setSiteId] = useState(existing?.siteId ?? "yard-a");
  const [berthId, setBerthId] = useState(existing?.berthId ?? "");
  const [role, setRole] = useState(existing?.role ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [smsOptIn, setSmsOptIn] = useState(existing?.smsOptIn ?? true);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !phoneNumber.trim()) {
      setError("이름과 전화번호를 입력하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    const body: SmsRecipientInput = {
      name: name.trim(),
      phoneNumber: phoneNumber.trim(),
      siteId: siteId.trim() || null,
      berthId: berthId.trim() || null,
      role: role.trim() || null,
      enabled,
      smsOptIn,
      notes: notes.trim() || null,
    };
    try {
      if (edit && existing) await api.updateSmsRecipient(existing.recipientId, body);
      else await api.createSmsRecipient(body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={edit ? "SMS 수신자 수정" : "SMS 수신자 추가"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-accent" style={{ flex: 1 }} disabled={busy} onClick={submit}>
            {busy ? "저장 중…" : "저장"}
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            취소
          </button>
        </>
      }
    >
      {error && <div className="alert-msg">{error}</div>}
      <div className="form-row">
        <div className="field-light">
          <label>이름</label>
          <input className="input-light" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-light">
          <label>전화번호 (E.164)</label>
          <input
            className="input-light"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+821012345678"
          />
        </div>
      </div>
      <div className="form-row">
        <div className="field-light">
          <label>Site</label>
          <input className="input-light" value={siteId} onChange={(e) => setSiteId(e.target.value)} />
        </div>
        <div className="field-light">
          <label>Berth (비우면 전체)</label>
          <input className="input-light" value={berthId} onChange={(e) => setBerthId(e.target.value)} />
        </div>
      </div>
      <div className="field-light">
        <label>역할</label>
        <input className="input-light" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Safety / Shift A" />
      </div>
      <div className="recipient-toggles">
        <label className="recipient-toggle">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>활성</span>
        </label>
        <label className="recipient-toggle">
          <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} />
          <span>SMS 수신 동의</span>
        </label>
      </div>
      <div className="field-light">
        <label>메모</label>
        <textarea className="input-light" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}

export function SmsRecipientsManage() {
  const [recipients, setRecipients] = useState<SmsRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SmsRecipient | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecipients(await api.listSmsRecipients());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (recipient: SmsRecipient, patch: SmsRecipientInput) => {
    try {
      const updated = await api.updateSmsRecipient(recipient.recipientId, patch);
      setRecipients((prev) => prev.map((item) => (item.recipientId === updated.recipientId ? updated : item)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "변경 실패");
    }
  };

  const remove = async (recipient: SmsRecipient) => {
    if (!window.confirm(`${recipient.name} SMS 수신자를 삭제할까요?`)) return;
    try {
      await api.deleteSmsRecipient(recipient.recipientId);
      setRecipients((prev) => prev.filter((item) => item.recipientId !== recipient.recipientId));
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>SMS 수신자</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            DANGER 이벤트 발생 시 활성/동의 수신자에게 직접 SMS를 발송합니다.
          </div>
        </div>
        <button
          className="btn btn-accent btn-icon"
          onClick={() => setCreating(true)}
          data-guide="recipient-add"
        >
          <Plus size={14} /> 수신자 추가
        </button>
      </div>

      {error && <div className="banner-danger">{error}</div>}

      {loading ? (
        <div className="center" style={{ padding: 40 }}>
          <div className="spin" />
        </div>
      ) : (
        <div className="recipient-list">
          {recipients.map((recipient) => {
            const active = recipient.enabled && recipient.smsOptIn;
            return (
              <div className="recipient-row" key={recipient.recipientId}>
                <div className="recipient-main">
                  <span className={`recipient-status ${active ? "recipient-status--on" : "recipient-status--off"}`}>
                    {active ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                  </span>
                  <div>
                    <strong>{recipient.name}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {recipient.phoneNumber} · {recipient.siteId || "전체 site"} · {recipient.berthId || "전체 berth"}
                    </div>
                  </div>
                </div>
                <span className="badge">{recipient.role || "역할 미지정"}</span>
                <span className="muted" style={{ minWidth: 170, fontSize: 12 }}>
                  최근 발송 {fmtDate(recipient.lastNotifiedAt)}
                </span>
                <span className="row-actions">
                  <button
                    className="btn-sm"
                    title={recipient.enabled ? "비활성화" : "활성화"}
                    onClick={() => toggle(recipient, { enabled: !recipient.enabled })}
                  >
                    <MessageSquare size={13} /> {recipient.enabled ? "활성" : "비활성"}
                  </button>
                  <button
                    className="btn-sm"
                    title={recipient.smsOptIn ? "수신 동의 해제" : "수신 동의"}
                    onClick={() => toggle(recipient, { smsOptIn: !recipient.smsOptIn })}
                  >
                    {recipient.smsOptIn ? "동의" : "미동의"}
                  </button>
                  <button className="btn-sm" onClick={() => setEditing(recipient)}>
                    <Pencil size={13} /> 수정
                  </button>
                  <button className="btn-sm btn-danger" onClick={() => remove(recipient)}>
                    <Trash2 size={13} /> 삭제
                  </button>
                </span>
              </div>
            );
          })}
          {recipients.length === 0 && <div className="muted">등록된 SMS 수신자가 없습니다.</div>}
        </div>
      )}

      {creating && (
        <RecipientForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {editing && (
        <RecipientForm
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
