import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { resetPassword, setStoredApiKey } from "../utils/api";

function useQuery() {
  const location = useLocation();
  return useMemo(() => new URLSearchParams(location.search), [location.search]);
}

export default function ResetPassword() {
  const query = useQuery();
  const navigate = useNavigate();
  const token = String(query.get("token") ?? "").trim();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!token) {
      setError("Reset link is missing a token.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const result = await resetPassword(token, password);
      if (!result.ok) {
        setError(result.error ?? "Password reset failed.");
        return;
      }
      if (result.token) {
        setStoredApiKey(result.token);
        navigate("/");
        return;
      }
      setNotice("Password updated. You can now sign in.");
      navigate("/login");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-layout" style={{ gridTemplateColumns: "1fr" }}>
        <section className="panel auth-card" aria-label="Reset password" style={{ justifySelf: "center", width: "min(520px, 100%)" }}>
          <div className="auth-card__header">
            <h1 className="auth-card__title">Reset password</h1>
          </div>

          <form onSubmit={onSubmit} className="auth-form">
            <label className="auth-field">
              <div className="auth-label">New password</div>
              <input
                className="auth-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
              />
            </label>

            <label className="auth-field">
              <div className="auth-label">Confirm password</div>
              <input
                className="auth-input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Repeat password"
              />
            </label>

            {error && <div className="auth-error" role="alert">{error}</div>}
            {notice && <div className="auth-notice" role="status">{notice}</div>}

            <button type="submit" className="btn primary auth-submit" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </button>

            <button type="button" className="btn ghost" onClick={() => navigate("/login")}>
              Back to sign in
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
