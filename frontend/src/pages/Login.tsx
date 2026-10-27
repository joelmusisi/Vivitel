import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import ViviLogo from "../components/ViviLogo";
import { canForPath, getApiKey, login, registerDemoAccount, requestPasswordReset } from "../utils/api";
import { phonePostLoginPath, POST_LOGIN_PATH_KEY, requiresMandatoryLogin, shouldUsePhoneMode } from "../utils/phoneMode";
import { isRegionId, readActiveRegion, rememberActiveRegion, REGION_IDS, REGION_SERVERS, type RegionId } from "../utils/regionServers";

function InputIcon({ children }: { children: React.ReactNode }) {
  return <span className="auth-input-icon" aria-hidden="true">{children}</span>;
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h16v12H4z" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 11V8a5 5 0 0 1 10 0v3" />
      <rect x="6" y="11" width="12" height="10" rx="2" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12s4-7 10-7c2.4 0 4.5 1 6.2 2.3" />
      <path d="M22 12s-4 7-10 7c-2.4 0-4.5-1-6.2-2.3" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

const serverLoginUrl = (region: RegionId) => `https://${REGION_SERVERS[region].host}/login?server=${region}`;

const stayOnThisHost = (region: RegionId) => {
  if (typeof window === "undefined") return true;
  const host = String(window.location.hostname ?? "").trim().toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  return host === REGION_SERVERS[region].host;
};

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedServer = searchParams.get("server");
  const year = new Date().getFullYear();
  const [mode, setMode] = useState<"ground" | "aerial">("ground");
  const [panel, setPanel] = useState<"signin" | "demo">("signin");
  const [name, setName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [dealer, setDealer] = useState("");
  const [databaseName, setDatabaseName] = useState("");
  const [siteName, setSiteName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [serverId, setServerId] = useState<RegionId>(() => (isRegionId(requestedServer) ? requestedServer : readActiveRegion()));

  const mandatoryLogin = requiresMandatoryLogin();
  const phoneLayout = shouldUsePhoneMode();

  const getPostLoginPath = () => {
    const phoneDefault = phonePostLoginPath();
    const nativeDefault = mandatoryLogin
      ? phoneDefault
      : canForPath("/Track/tracking/live", "view")
        ? "/Track/tracking/live"
        : phoneDefault;
    if (typeof window === "undefined") return "/";
    const stored = String(window.localStorage.getItem(POST_LOGIN_PATH_KEY) ?? "").trim();
    if (!stored.startsWith("/")) return mandatoryLogin ? nativeDefault : "/";
    if (stored === "/login" || stored === "/reset-password") {
      return mandatoryLogin ? nativeDefault : "/";
    }
    return stored || (mandatoryLogin ? nativeDefault : "/");
  };

  const consumePostLoginPath = () => {
    const target = getPostLoginPath();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(POST_LOGIN_PATH_KEY);
    }
    return target;
  };

  useEffect(() => {
    if (!getApiKey()) return;
    navigate(consumePostLoginPath(), { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (!isRegionId(requestedServer)) return;
    if (!stayOnThisHost(requestedServer)) {
      window.location.replace(serverLoginUrl(requestedServer));
      return;
    }
    rememberActiveRegion(requestedServer);
  }, [requestedServer]);

  const modeLabel = mode === "ground" ? "Ground" : "Aerial";
  const regionServer = isRegionId(serverId) ? REGION_SERVERS[serverId] : null;

  const onSelectServer = (value: string) => {
    if (!isRegionId(value)) return;
    setError(null);
    if (!stayOnThisHost(value)) {
      window.location.assign(serverLoginUrl(value));
      return;
    }
    setServerId(value);
    rememberActiveRegion(value);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const e = email.trim();
    const p = password;
    const region = isRegionId(serverId) ? serverId : undefined;
    if (region) rememberActiveRegion(region);
    if (panel === "demo") {
      const displayName = name.trim();
      const hierarchy = {
        organisation: organisation.trim(),
        dealer: dealer.trim(),
        database: databaseName.trim(),
        site: siteName.trim()
      };
      if (!displayName || !e || !p || !hierarchy.organisation || !hierarchy.dealer || !hierarchy.database || !hierarchy.site) {
        setError("Enter your name, email, password, and the organisation, dealer, database, and site.");
        return;
      }
      if (p.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      setBusy(true);
      try {
        const created = await registerDemoAccount({
          name: displayName,
          email: e,
          password: p,
          ...hierarchy,
          region: isRegionId(serverId) ? serverId : undefined
        });
        if (!created.ok) {
          setError(created.error ?? "Could not create the demo account.");
          return;
        }
        const result = await login(e, p, region);
        if (!result.ok) {
          setNotice(created.message ?? "Demo account created. Sign in to start your 14 days.");
          setPanel("signin");
          return;
        }
        if (getApiKey()) navigate(consumePostLoginPath(), { replace: true });
        else setError("Login token was not saved.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!e || !p) {
      setError("Enter email and password.");
      return;
    }
    setBusy(true);
    try {
      const result = await login(e, p, region);
      if (!result.ok) {
        setError(result.error ?? "Login failed.");
        return;
      }
      // If token is stored successfully, go to last visited page (or home).
      if (getApiKey()) navigate(consumePostLoginPath(), { replace: true });
      else setError("Login token was not saved.");
    } finally {
      setBusy(false);
    }
  };

  const onForgotPassword = async () => {
    setError(null);
    setNotice(null);
    const e = email.trim();
    if (!e) {
      setError("Enter your email first.");
      return;
    }
    setResetBusy(true);
    try {
      const result = await requestPasswordReset(e);
      if (!result.ok) {
        setError(result.error ?? "Could not request a password reset.");
        return;
      }
      if (result.resetUrl && typeof window !== "undefined") {
        const parsed = new URL(result.resetUrl, window.location.origin);
        navigate(`${parsed.pathname}${parsed.search}${parsed.hash}`);
        return;
      }
      setNotice(result.message ?? "If an account exists for this email, reset instructions will be sent.");
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className={`auth-page${phoneLayout ? " auth-page--phone" : ""}`}>
      <div className="auth-layout">
        <section className="auth-card" aria-label="Sign in">
          <div className="auth-card-brand">
            <ViviLogo variant="light" align="center" className="auth-logo auth-logo--wordmark" />
          </div>

          <div className="auth-card__header">
            <h1 className="auth-card__title">
              {panel === "demo" ? "Start a 14-day demo" : "Welcome back"}
            </h1>
            <p className="auth-card__lead">
              {panel === "demo"
                ? "Basic User access for 14 continuous days"
                : regionServer
                  ? `Sign in to ${regionServer.label}`
                  : "Sign in"}
            </p>
            <p className="auth-card__sublead">
              {mandatoryLogin ? (
                <>Use the same email and password as on desktop to access your fleet.</>
              ) : (
                <>
                  Access your unified logistics platform.{" "}
                  <Link to="/" className="auth-inline-link">
                    Back to website
                  </Link>
                </>
              )}
            </p>
          </div>

          <>
          <div className="auth-segment" role="tablist" aria-label="Portal mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "ground"}
              className={`auth-segment-btn ${mode === "ground" ? "active" : ""}`}
              onClick={() => setMode("ground")}
            >
              Ground Fleet
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "aerial"}
              className={`auth-segment-btn ${mode === "aerial" ? "active" : ""}`}
              onClick={() => setMode("aerial")}
            >
              Aerial Ops
            </button>
          </div>

          <form onSubmit={onSubmit} className="auth-form">
            {panel === "demo" && (
              <>
              <label className="auth-field">
                <div className="auth-label">Your name</div>
                <div className="auth-input-wrap">
                  <InputIcon>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="12" cy="8" r="3" />
                      <path d="M5 19c1.4-3 3.8-4.5 7-4.5S17.6 16 19 19" />
                    </svg>
                  </InputIcon>
                  <input
                    className="auth-input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    placeholder="Ada Mensah"
                  />
                </div>
              </label>
              <label className="auth-field">
                <div className="auth-label">Organisation</div>
                <div className="auth-input-wrap">
                  <input className="auth-input" value={organisation} onChange={(e) => setOrganisation(e.target.value)} placeholder="Northstar Logistics" />
                </div>
              </label>
              <label className="auth-field">
                <div className="auth-label">Dealer</div>
                <div className="auth-input-wrap">
                  <input className="auth-input" value={dealer} onChange={(e) => setDealer(e.target.value)} placeholder="Harbour Motors" />
                </div>
              </label>
              <label className="auth-field">
                <div className="auth-label">Database</div>
                <div className="auth-input-wrap">
                  <input className="auth-input" value={databaseName} onChange={(e) => setDatabaseName(e.target.value)} placeholder="Fleet East" />
                </div>
              </label>
              <label className="auth-field">
                <div className="auth-label">Site</div>
                <div className="auth-input-wrap">
                  <input className="auth-input" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Mombasa Yard" />
                </div>
              </label>
              </>
            )}
            <label className="auth-field">
              <div className="auth-label">Server</div>
              <div className="auth-input-wrap">
                <select
                  className="auth-input auth-select"
                  value={serverId}
                  onChange={(e) => onSelectServer(e.target.value)}
                  aria-label="Server"
                >
                  {REGION_IDS.map((id) => (
                    <option key={id} value={id}>
                      {REGION_SERVERS[id].label}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="auth-field">
              <div className="auth-label">Work Email</div>
              <div className="auth-input-wrap">
                <InputIcon>
                  <MailIcon />
                </InputIcon>
                <input
                  className="auth-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  placeholder="name@vivitelematics.com"
                />
              </div>
            </label>

            <label className="auth-field">
              <div className="auth-label-row">
                <div className="auth-label">Password</div>
                <button
                  type="button"
                  className="auth-link"
                  onClick={onForgotPassword}
                  disabled={resetBusy || busy}
                >
                  {resetBusy ? "Requesting…" : "Forgot password?"}
                </button>
              </div>
              <div className="auth-input-wrap">
                <InputIcon>
                  <LockIcon />
                </InputIcon>
                <input
                  className="auth-input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="auth-input-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </label>

            <label className="auth-check">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Remember device</span>
            </label>

            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="auth-notice" role="status">
                {notice}
              </div>
            )}

            <button type="submit" className="auth-btn auth-btn--primary" disabled={busy}>
              {busy
                ? panel === "demo"
                  ? "Creating demo…"
                  : "Signing in…"
                : panel === "demo"
                  ? "Create demo and sign in"
                  : `Access ${modeLabel} Dashboard →`}
            </button>

            <button
              type="button"
              className="auth-link"
              onClick={() => {
                setError(null);
                setNotice(null);
                setPanel((current) => (current === "demo" ? "signin" : "demo"));
              }}
            >
              {panel === "demo" ? "Back to sign in" : "Start a 14-day demo"}
            </button>

            <div className="auth-divider" role="separator" aria-label="Enterprise access">
              <span>Enterprise Access</span>
            </div>

            <div className="auth-provider-row">
              <button type="button" className="auth-btn auth-btn--secondary" disabled>
                Global ID
              </button>
              <button type="button" className="auth-btn auth-btn--secondary" disabled>
                SSO Login
              </button>
            </div>

            <div className="auth-legal">
              vivi Telematics Platform v4.2.0 · System Status
            </div>
          </form>
          </>
        </section>
      </div>

      <footer className="auth-footer">
        © {year} Vivitel. All rights reserved.
      </footer>
    </div>
  );
}
