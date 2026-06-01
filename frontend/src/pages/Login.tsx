import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAccess } from "../context/AccessContext";
import { login } from "../utils/api";
import "../index.css";

export default function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, loading, refresh } = useAccess();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(email.trim(), password);
      if (!result) {
        setError("Invalid email or password, or account is inactive.");
        return;
      }
      await refresh();
      navigate("/", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page admin-page" style={{ minHeight: "70vh", display: "grid", placeItems: "center" }}>
      <form
        onSubmit={onSubmit}
        className="admin-modal-card"
        style={{ width: "min(420px, 92vw)", padding: 24 }}
      >
        <div className="admin-title">Sign in</div>
        <p style={{ opacity: 0.8, marginBottom: 20 }}>
          Use your assigned email and password. You will only see pages and organisations granted to your
          account.
        </p>
        <label className="admin-modal-field">
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="admin-modal-field">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p style={{ color: "#b42318" }}>{error}</p>}
        <button type="submit" className="admin-btn" disabled={submitting} style={{ width: "100%" }}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
