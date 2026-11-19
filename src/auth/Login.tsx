import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  autoSignIn,
  confirmSignIn,
  confirmResetPassword,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  signIn,
  signInWithRedirect,
  signOut,
  signUp,
} from "aws-amplify/auth";
import { config } from "../lib/config";
import { useAuth } from "./AuthProvider";

type Mode = "signin" | "newPassword" | "signup" | "confirmSignup" | "forgot" | "confirmForgot";

const PASSWORD_HINT = "8자 이상, 영문 대문자·소문자·숫자를 포함하세요.";

function errorText(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : "";
  // The PreSignUp Lambda rejects emails outside the SSM allowlist with this code.
  if (msg.includes("NOT_ALLOWLISTED")) {
    return "가입이 허용되지 않은 이메일입니다. 관리자에게 등록을 요청하세요.";
  }
  if (/password/i.test(msg) && /policy|conform/i.test(msg)) return `비밀번호 조건 미충족: ${PASSWORD_HINT}`;
  return msg || fallback;
}

// A session left by another tab or an earlier login makes signIn throw;
// replace it with the account the user just typed.
async function signInFresh(input: Parameters<typeof signIn>[0]) {
  try {
    return await signIn(input);
  } catch (err) {
    if (!(err instanceof Error) || err.name !== "UserAlreadyAuthenticatedException") throw err;
    await signOut();
    return signIn(input);
  }
}

export function Login() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (next: Mode) => {
    setError(null);
    setNotice(null);
    setMode(next);
  };

  const finish = async () => {
    await refresh();
    navigate("/", { replace: true });
  };

  const onSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await signInFresh({ username: email, password });
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

  const onSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await signUp({
        username: email,
        password,
        options: { userAttributes: { email }, autoSignIn: true },
      });
      if (res.nextStep.signUpStep === "CONFIRM_SIGN_UP") {
        setNotice(`${email}로 발송된 인증 코드를 입력하세요.`);
        setMode("confirmSignup");
      } else {
        switchMode("signin");
      }
    } catch (err) {
      setError(errorText(err, "회원가입 실패"));
    } finally {
      setBusy(false);
    }
  };

  const onConfirmSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await confirmSignUp({ username: email, confirmationCode: code.trim() });
      if (res.nextStep.signUpStep === "COMPLETE_AUTO_SIGN_IN") {
        const signedIn = await autoSignIn();
        if (signedIn.isSignedIn) {
          await finish();
          return;
        }
      }
      switchMode("signin");
      setNotice("인증이 완료되었습니다. 로그인하세요.");
    } catch (err) {
      setError(errorText(err, "인증 실패"));
    } finally {
      setBusy(false);
    }
  };

  const onResendCode = async () => {
    setError(null);
    try {
      await resendSignUpCode({ username: email });
      setNotice("인증 코드를 다시 보냈습니다.");
    } catch (err) {
      setError(errorText(err, "코드 재발송 실패"));
    }
  };

  const onForgot = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await resetPassword({ username: email });
      setNotice(`${email}로 발송된 인증 코드와 새 비밀번호를 입력하세요.`);
      setMode("confirmForgot");
    } catch (err) {
      setError(errorText(err, "인증 코드 발송 실패"));
    } finally {
      setBusy(false);
    }
  };

  const onConfirmForgot = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await confirmResetPassword({ username: email, confirmationCode: code.trim(), newPassword });
      switchMode("signin");
      setPassword("");
      setNotice("비밀번호를 변경했습니다. 새 비밀번호로 로그인하세요.");
    } catch (err) {
      setError(errorText(err, "비밀번호 변경 실패"));
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
        {notice && !error && <p style={{ color: "#cdccc6", fontSize: 13 }}>{notice}</p>}

        {mode === "signup" && (
          <form className="login-card" onSubmit={onSignUp} style={{ gap: "var(--sp-3)" }}>
            <div className="field">
              <label htmlFor="su-email">이메일</label>
              <input
                id="su-email"
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="su-password">비밀번호</label>
              <input
                id="su-password"
                className="input"
                type="password"
                autoComplete="new-password"
                aria-describedby="su-password-hint"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <small id="su-password-hint" style={{ color: "#cdccc6" }}>{PASSWORD_HINT}</small>
            </div>
            <button className="btn btn-accent btn-block" type="submit" disabled={busy}>
              {busy ? "가입 중…" : "회원가입"}
            </button>
            <button type="button" className="btn btn-neutral btn-block" onClick={() => switchMode("signin")}>
              로그인으로 돌아가기
            </button>
          </form>
        )}

        {mode === "confirmSignup" && (
          <form className="login-card" onSubmit={onConfirmSignUp} style={{ gap: "var(--sp-3)" }}>
            <div className="field">
              <label htmlFor="su-code">이메일 인증 코드</label>
              <input
                id="su-code"
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-accent btn-block" type="submit" disabled={busy}>
              {busy ? "확인 중…" : "인증 후 로그인"}
            </button>
            <button type="button" className="btn btn-neutral btn-block" onClick={onResendCode}>
              인증 코드 다시 받기
            </button>
          </form>
        )}

        {mode === "forgot" && (
          <form className="login-card" onSubmit={onForgot} style={{ gap: "var(--sp-3)" }}>
            <div className="field">
              <label htmlFor="fp-email">가입한 이메일</label>
              <input
                id="fp-email"
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-accent btn-block" type="submit" disabled={busy}>
              {busy ? "발송 중…" : "인증 코드 받기"}
            </button>
            <button type="button" className="btn btn-neutral btn-block" onClick={() => switchMode("signin")}>
              로그인으로 돌아가기
            </button>
          </form>
        )}

        {mode === "confirmForgot" && (
          <form className="login-card" onSubmit={onConfirmForgot} style={{ gap: "var(--sp-3)" }}>
            <div className="field">
              <label htmlFor="fp-code">이메일 인증 코드</label>
              <input
                id="fp-code"
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="fp-newpw">새 비밀번호</label>
              <input
                id="fp-newpw"
                className="input"
                type="password"
                autoComplete="new-password"
                aria-describedby="fp-newpw-hint"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <small id="fp-newpw-hint" style={{ color: "#cdccc6" }}>{PASSWORD_HINT}</small>
            </div>
            <button className="btn btn-accent btn-block" type="submit" disabled={busy}>
              {busy ? "변경 중…" : "비밀번호 변경"}
            </button>
            <button type="button" className="btn btn-neutral btn-block" onClick={() => onForgot()} disabled={busy}>
              인증 코드 다시 받기
            </button>
            <button type="button" className="btn btn-neutral btn-block" onClick={() => switchMode("signin")}>
              로그인으로 돌아가기
            </button>
          </form>
        )}

        {mode === "signin" && (
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
            <button type="button" className="btn btn-neutral btn-block" onClick={() => switchMode("signup")}>
              계정이 없으면 회원가입
            </button>
            <button type="button" className="btn btn-neutral btn-block" onClick={() => switchMode("forgot")}>
              비밀번호 찾기
            </button>
          </form>
        )}

        {mode === "newPassword" && (
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
