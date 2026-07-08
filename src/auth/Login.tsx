import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { confirmSignIn, signIn, signInWithRedirect } from "aws-amplify/auth";
import { config } from "../lib/config";
import { useAuth } from "./AuthProvider";

type Mode = "signin" | "newPassword";

export function Login() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    await refresh();
    navigate("/", { replace: true });
  };

  const onSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await signIn({ username: email, password });
      if (res.isSignedIn) {
        await finish();
      } else if (
        res.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"
      ) {
        setMode("newPassword");
      } else {
        setError(`추가 인증 단계가 필요합니다: ${res.nextStep.signInStep}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 실패");
    } finally {
      setBusy(false);
    }
  };

  const onNewPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await confirmSignIn({ challengeResponse: newPassword });
      if (res.isSignedIn) await finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "비밀번호 설정 실패");
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setError(null);
    try {
      await signInWithRedirect({ provider: "Google" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google 로그인 실패");
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <h1>AE-Sentinel</h1>
          <p>계류삭 파단 예측 · 스냅백 위험구역 관제</p>
        </div>

        {error && <div className="err">{error}</div>}

        {mode === "signin" ? (
          <form className="login-card" onSubmit={onSignIn} style={{ gap: "var(--sp-3)" }}>
            <div className="field">
              <label htmlFor="email">이메일</label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">비밀번호</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-accent btn-block" type="submit" disabled={busy}>
              {busy ? "로그인 중…" : "로그인"}
            </button>

            <div className="divider">또는</div>
            <button
              type="button"
              className="btn btn-neutral btn-block"
              onClick={onGoogle}
              disabled={!config.enableGoogle}
              title={config.enableGoogle ? "Google로 로그인" : "Google 로그인은 아직 설정되지 않았습니다"}
            >
              <span aria-hidden>G</span> Google로 계속하기
            </button>
          </form>
        ) : (
          <form className="login-card" onSubmit={onNewPassword} style={{ gap: "var(--sp-3)" }}>
            <p style={{ color: "#cdccc6", fontSize: 13 }}>
              최초 로그인입니다. 새 비밀번호를 설정하세요.
            </p>
            <div className="field">
              <label htmlFor="newpw">새 비밀번호</label>
              <input
                id="newpw"
                className="input"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-accent btn-block" type="submit" disabled={busy}>
              {busy ? "설정 중…" : "비밀번호 설정 후 로그인"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
