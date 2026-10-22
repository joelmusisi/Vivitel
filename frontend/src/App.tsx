import { Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { TopNav } from "./components/TopNav";
import { ControlNav, TrackNav, AnalyzeNav, DeliverNav } from "./navData";
import PageShell from "./components/PageShell";
import VTLoader from "./components/VTLoader";
import OrgRibbon from "./components/OrgRibbon";
import { saveToApi, refreshAuthMe, canForPath, getApiKey, setStoredApiKey, hasCachedRbacPermissions, fetchUserProfile, updateUserProfile } from "./utils/api";
import { startBackgroundSiteSync, stopBackgroundSiteSync } from "./utils/backgroundSiteSync";
import { startAlertCenter, stopAlertCenter } from "./utils/alertCenter";
import { isLikelyNativeShell, isPublicAuthPath, isTabletDevice, phonePostLoginPath, rememberPostLoginPath, requiresMandatoryLogin, shouldUsePhoneMode } from "./utils/phoneMode";
import { applyAccountTheme, initTheme, registerThemeAccountPersister } from "./utils/themeMode";
import {
  clearActiveAssetPrefs,
  clearUserPref,
  USER_PREF_KEYS
} from "./utils/userAppPrefs";
import {
  MobilePhoneBottomNav,
  MobilePhoneHeader
} from "./components/mobile/MobilePhoneShell";
import "./components/mobile/MobilePhoneShell.css";
import { DemoGuide } from "./components/demo/DemoGuide";
import { TrialBanner } from "./components/demo/TrialBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DesktopScaleRoot } from "./components/DesktopScaleRoot";
import { installIconTooltips } from "./utils/iconTooltips";
import { FleetFilterProvider } from "./contexts/FleetFilterContext";
import { DbProfileProvider } from "./contexts/DbProfileContext";
import {
  appRouteComponents,
  Home,
  Login,
  ResetPassword,
  LiveSharePublic,
  MobileHome,
  MobileProfile,
  MobileAlerts,
  MobilePreview,
  MobilePersonalSettings,
  MarketingLayout,
  MarketingHome,
  MarketingFeaturePage,
  MarketingContactPage,
  MarketingCategoryPage,
  MarketingSupportHubPage,
  MarketingInfoPage,
  isMarketingPublicPath,
  moduleLabelForPath
} from "./modules";

const USER_ADMIN_DETAIL_ROUTES: { path: string; title: string; description?: string }[] = [
  { path: "/Control/user-admin/users/create", title: "Create user", description: "User Admin" },
  { path: "/Control/user-admin/users/edit/:userId", title: "Edit user", description: "User Admin" },
  { path: "/Control/user-admin/users/access/:userId", title: "User access", description: "User Admin" },
  { path: "/Control/user-admin/roles/create", title: "Create role", description: "User Admin" },
  { path: "/Control/user-admin/roles/edit/:roleId", title: "Edit role", description: "User Admin" },
  { path: "/Control/user-admin/security-groups/create", title: "Create security group", description: "User Admin" },
  { path: "/Control/user-admin/security-groups/edit/:groupId", title: "Edit security group", description: "User Admin" }
];

function routeElements() {
  const routes: { path: string; title: string; description?: string }[] = [];
  TrackNav.forEach((group) => {
    group.items.forEach((item) => routes.push({ path: item.path, title: item.label, description: group.title }));
  });
  ControlNav.forEach((group) => {
    group.items.forEach((item) => routes.push({ path: item.path, title: item.label, description: group.title }));
  });
  AnalyzeNav.forEach((group) => {
    group.items.forEach((item) => routes.push({ path: item.path, title: item.label, description: group.title }));
  });
  DeliverNav.forEach((group) => {
    group.items.forEach((item) => routes.push({ path: item.path, title: item.label, description: group.title }));
  });
  for (const route of USER_ADMIN_DETAIL_ROUTES) routes.push(route);
  return routes;
}

type RouteComponent = ComponentType | LazyExoticComponent<ComponentType>;

function renderLazyRoute(
  Component: RouteComponent | undefined,
  title: string,
  description?: string,
  options?: { errorBoundaryTitle?: string; errorBoundaryResetKey?: string }
) {
  if (!Component) {
    return <PageShell title={title} description={description} />;
  }

  const content = options?.errorBoundaryTitle ? (
    <ErrorBoundary title={options.errorBoundaryTitle} resetKey={options.errorBoundaryResetKey}>
      <Component />
    </ErrorBoundary>
  ) : (
    <Component />
  );

  return <Suspense fallback={<VTLoader />}>{content}</Suspense>;
}

function renderProtectedRoute(
  path: string,
  Component: RouteComponent | undefined,
  title: string,
  description?: string,
  contextEpoch = 0
) {
  if (!canForPath(path, "view")) {
    return <PageShell title="Access denied" description="You do not have access to this page." />;
  }
  return renderLazyRoute(Component, title, description, {
    errorBoundaryTitle: title || moduleLabelForPath(path),
    // Reset error UI when the route OR tenant/site context changes after a switch.
    errorBoundaryResetKey: `${path}::${contextEpoch}`
  });
}

export function App() {
  const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;
  const LAST_ACTIVITY_KEY = "vivi.lastActivityAt";
  const [authStamp, setAuthStamp] = useState(0);
  const [authed, setAuthed] = useState(() => Boolean(getApiKey()));
  const [rbacReady, setRbacReady] = useState(false);
  const [contextEpoch, setContextEpoch] = useState(0);
  const [modal, setModal] = useState<{
    title: string;
    subtitle?: string;
    fields: string[];
  } | null>(null);
  const [modalValues, setModalValues] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const location = useLocation();
  const [phoneMode, setPhoneMode] = useState(() => shouldUsePhoneMode());
  const nativeShell = isLikelyNativeShell();
  const nativeShellLandingPath = phoneMode
    ? phonePostLoginPath()
    : canForPath("/Track/tracking/live", "view")
      ? "/Track/tracking/live"
      : "/";
  const isHistoricalTracking = location.pathname === "/Track/tracking/historical";
  const hideTopNav = phoneMode;
  const hideOrgRibbon = phoneMode || isHistoricalTracking;
  const isMapTrackingRoute =
    location.pathname === "/Track/tracking/live" || location.pathname === "/Track/tracking/historical";
  const mandatoryLogin = requiresMandatoryLogin();
  const isMarketingRoute =
    !mandatoryLogin &&
    (isMarketingPublicPath(location.pathname) || (!authed && location.pathname === "/"));

  useEffect(() => installIconTooltips(), []);

  useEffect(() => {
    if (authed || !mandatoryLogin || isPublicAuthPath(location.pathname)) return;
    rememberPostLoginPath(`${location.pathname}${location.search}${location.hash}`);
    navigate("/login", { replace: true });
  }, [authed, mandatoryLogin, location.pathname, location.search, location.hash, navigate]);

  // Keep the last in-app page so refresh / re-login can restore it.
  useEffect(() => {
    if (!authed) return;
    rememberPostLoginPath(`${location.pathname}${location.search}${location.hash}`);
  }, [authed, location.pathname, location.search, location.hash]);

  // If auth dropped while still on an app URL, remember it before the authless shell navigates away.
  useEffect(() => {
    if (authed) return;
    rememberPostLoginPath(`${location.pathname}${location.search}${location.hash}`);
  }, [authed, location.pathname, location.search, location.hash]);

  useEffect(() => {
    initTheme();
    const refreshPhoneMode = () => {
      const tablet = isTabletDevice();
      setPhoneMode(shouldUsePhoneMode());
      document.documentElement.classList.toggle("vivi-tablet", tablet);
    };
    refreshPhoneMode();
    window.addEventListener("resize", refreshPhoneMode);
    return () => {
      window.removeEventListener("resize", refreshPhoneMode);
      document.documentElement.classList.remove("vivi-tablet");
    };
  }, []);

  useEffect(() => {
    const bumpContextEpoch = () => setContextEpoch((value) => value + 1);
    window.addEventListener("vivi:orgchange", bumpContextEpoch);
    window.addEventListener("vivi:contextchange", bumpContextEpoch);
    return () => {
      window.removeEventListener("vivi:orgchange", bumpContextEpoch);
      window.removeEventListener("vivi:contextchange", bumpContextEpoch);
    };
  }, []);

  useEffect(() => {
    if (!authed) {
      registerThemeAccountPersister(null);
      return;
    }
    registerThemeAccountPersister((theme) => {
      void updateUserProfile({ theme });
    });
    let cancelled = false;
    void (async () => {
      const profile = await fetchUserProfile();
      if (cancelled || !profile) return;
      applyAccountTheme(profile.theme);
    })();
    return () => {
      cancelled = true;
      registerThemeAccountPersister(null);
    };
  }, [authed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = String(window.location.hostname ?? "").trim().toLowerCase();
    const isMainPreviewHost = /^[a-f0-9]{8}\.vivi-telematics-frontend\.pages\.dev$/.test(host);
    const isPublishPreviewHost = /^[a-f0-9]{8}\.vivi-telematic-frontend\.pages\.dev$/.test(host);
    if (!isMainPreviewHost && !isPublishPreviewHost) return;
    const stableHost = isMainPreviewHost
      ? "vivi-telematics-frontend.pages.dev"
      : "vivi-telematic-frontend.pages.dev";
    const nextUrl = `${window.location.protocol}//${stableHost}${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(nextUrl);
  }, []);

  const generatedRoutes = routeElements();
  // Composed from feature modules (track / control / analyze / deliver) — edit modules/*/routes.tsx only.
  const customComponents = appRouteComponents;

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const button = target.closest("button");
      if (!button) return;
      const navTarget = button.getAttribute("data-nav");
      if (navTarget) {
        navigate(navTarget);
        return;
      }
      const modalTitle = button.getAttribute("data-modal");
      if (modalTitle) {
        const fieldsAttr = button.getAttribute("data-modal-fields");
        const fields = (fieldsAttr ? fieldsAttr.split("|") : ["Name", "Owner", "Notes"])
          .map((field) => field.trim())
          .filter(Boolean);
        const initialValues = fields.reduce<Record<string, string>>((acc, field) => {
          acc[field] = "";
          return acc;
        }, {});
        setModalValues(initialValues);
        setModal({
          title: modalTitle,
          subtitle: button.getAttribute("data-modal-sub") ?? undefined,
          fields
        });
        return;
      }
      if (button.hasAttribute("data-toast-ignore")) return;
      const label =
        button.getAttribute("data-toast") ||
        button.getAttribute("aria-label") ||
        button.textContent?.trim();
      if (!label) return;
    };
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, [navigate]);

  useEffect(() => {
    const syncAuthed = () => setAuthed(Boolean(getApiKey()));
    syncAuthed();
    window.addEventListener("vivi:authchange", syncAuthed);
    window.addEventListener("storage", syncAuthed);
    return () => {
      window.removeEventListener("vivi:authchange", syncAuthed);
      window.removeEventListener("storage", syncAuthed);
    };
  }, []);

  useEffect(() => {
    if (!authed) {
      setRbacReady(false);
      return;
    }
    let cancelled = false;

    const doRefresh = async (showLoading = false) => {
      if (showLoading) setRbacReady(false);
      const result = await refreshAuthMe();
      if (cancelled) return;
      if (result.ok) {
        setRbacReady(true);
        setAuthStamp((v) => v + 1);
        return;
      }
      // Only force logout when the server confirms the session is invalid.
      // Network blips, 5xx, and upstream Traccar auth failures must not sign the user out.
      if (result.unauthorized) {
        rememberPostLoginPath();
        setStoredApiKey("");
        window.localStorage.setItem("vivi.apiKey.disabled", "true");
        window.localStorage.removeItem("vivi.tenantId");
        clearUserPref(USER_PREF_KEYS.contextType);
        clearUserPref(USER_PREF_KEYS.contextName);
        clearActiveAssetPrefs();
        window.localStorage.removeItem("vivi.contextOptions");
        window.localStorage.removeItem("vivi.lockedAsset");
        window.localStorage.removeItem("vivi.chat.conversationId");
        setRbacReady(false);
        setAuthed(false);
        return;
      }
      // Transient failure: keep the session and allow navigation with cached permissions.
      setRbacReady(true);
      setAuthStamp((v) => v + 1);
    };

    // Paint immediately when RBAC was cached from a prior session; refresh in background.
    const canPaintFromCache = hasCachedRbacPermissions();
    if (canPaintFromCache) {
      setRbacReady(true);
      void doRefresh(false);
    } else {
      void doRefresh(true);
    }
    const onFocus = () => {
      void doRefresh(false);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [authed]);

  useEffect(() => {
    if (!authed || !rbacReady) {
      stopAlertCenter();
      return;
    }
    startAlertCenter();
    return () => stopAlertCenter();
  }, [authed, rbacReady]);

  useEffect(() => {
    if (!authed || !rbacReady) {
      stopBackgroundSiteSync();
      return;
    }
    startBackgroundSiteSync();
    return () => stopBackgroundSiteSync();
  }, [authed, rbacReady]);

  useEffect(() => {
    if (!authed) return;
    let signedOut = false;

    const readLastActivityAt = () => {
      try {
        const raw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
        const last = raw ? Number(raw) : NaN;
        return Number.isFinite(last) ? last : 0;
      } catch {
        return 0;
      }
    };

    const writeLastActivityAt = (at: number) => {
      try {
        window.localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
      } catch {
        // ignore quota / private mode
      }
    };

    const logoutForInactivity = () => {
      if (signedOut) return;
      signedOut = true;
      // Full logout (same as TopNav): clear session and block build-time API key fallback.
      rememberPostLoginPath();
      setStoredApiKey("");
      window.localStorage.setItem("vivi.apiKey.disabled", "true");
      window.localStorage.removeItem("vivi.tenantId");
      clearUserPref(USER_PREF_KEYS.contextType);
      clearUserPref(USER_PREF_KEYS.contextName);
      clearActiveAssetPrefs();
      window.localStorage.removeItem("vivi.contextOptions");
      window.localStorage.removeItem("vivi.lockedAsset");
      window.localStorage.removeItem("vivi.chat.conversationId");
      setRbacReady(false);
      setAuthed(false);
      window.location.assign("/login");
    };

    const isExpired = () => {
      const last = readLastActivityAt();
      if (!last) return false;
      return Date.now() - last > INACTIVITY_TIMEOUT_MS;
    };

    const checkIdle = () => {
      if (isExpired()) logoutForInactivity();
    };

    const mark = () => {
      if (isExpired()) {
        logoutForInactivity();
        return;
      }
      writeLastActivityAt(Date.now());
    };

    // Check first — never reset the clock on mount/refresh, or a return after idle stays signed in.
    checkIdle();
    if (!signedOut && !readLastActivityAt()) writeLastActivityAt(Date.now());

    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "mousemove", "touchstart", "scroll"];
    events.forEach((name) => window.addEventListener(name, mark, { passive: true }));
    window.addEventListener("focus", checkIdle);
    document.addEventListener("visibilitychange", checkIdle);
    const timer = window.setInterval(checkIdle, 30_000);
    return () => {
      events.forEach((name) => window.removeEventListener(name, mark));
      window.removeEventListener("focus", checkIdle);
      document.removeEventListener("visibilitychange", checkIdle);
      window.clearInterval(timer);
    };
  }, [authed]);

  // authStamp forces re-render after RBAC refresh so canForPath picks up new permissions.
  void authStamp;

  if (isMarketingRoute) {
    return (
      <Suspense fallback={<VTLoader fullscreen />}>
        <Routes>
          <Route path="/" element={renderLazyRoute(MarketingLayout, "VIVI Telematics", "Loading website")}>
            <Route index element={renderLazyRoute(MarketingHome, "VIVI Telematics", "Loading website")} />
            <Route path="solutions/:slug" element={renderLazyRoute(MarketingFeaturePage, "Solutions", "Loading page")} />
            <Route path="features/:slug" element={renderLazyRoute(MarketingFeaturePage, "Solutions", "Loading page")} />
            <Route path="catalog/marine" element={<Navigate to="/solutions/tracking" replace />} />
            <Route path="catalog/auto-home" element={<Navigate to="/solutions/hardware" replace />} />
            <Route path="catalog/auto-home/:subSlug" element={<Navigate to="/solutions/hardware" replace />} />
            <Route path="catalog/enterprise-aviation" element={<Navigate to="/solutions/platform" replace />} />
            <Route path="catalog/:categorySlug" element={renderLazyRoute(MarketingCategoryPage, "Catalog", "Loading page")} />
            <Route path="stories" element={<Navigate to="/" replace />} />
            <Route path="stories/:storyId" element={<Navigate to="/" replace />} />
            <Route path="promotions" element={<Navigate to="/contact" replace />} />
            <Route path="company/blog" element={<Navigate to="/company/about" replace />} />
            <Route path="company/news" element={<Navigate to="/company/about" replace />} />
            <Route path="company/careers" element={<Navigate to="/contact" replace />} />
            <Route path="company/sustainability" element={<Navigate to="/company/about" replace />} />
            <Route path="discover/marine-charting" element={<Navigate to="/solutions/tracking" replace />} />
            <Route path="discover/drone-delivery" element={<Navigate to="/solutions/platform" replace />} />
            <Route path="discover/deliver" element={<Navigate to="/solutions/platform" replace />} />
            <Route path="support" element={renderLazyRoute(MarketingSupportHubPage, "Support", "Loading page")} />
            <Route path="support/:page" element={renderLazyRoute(MarketingInfoPage, "Support", "Loading page")} />
            <Route path="discover/:page" element={renderLazyRoute(MarketingInfoPage, "Discover", "Loading page")} />
            <Route path="company/:page" element={renderLazyRoute(MarketingInfoPage, "Company", "Loading page")} />
            <Route path="business/:page" element={renderLazyRoute(MarketingInfoPage, "Business", "Loading page")} />
            <Route path="contact" element={renderLazyRoute(MarketingContactPage, "Contact", "Loading page")} />
          </Route>
        </Routes>
      </Suspense>
    );
  }

  if (!authed) {
    const loginEntry = mandatoryLogin ? "/login" : "/";
    return (
      <div className={`app-shell app-shell--authless${mandatoryLogin ? " app-shell--authless-phone" : ""}`}>
        <Routes>
          <Route path="/share/live/:token" element={renderLazyRoute(LiveSharePublic, "Live share", "Loading page")} />
          <Route path="/login" element={renderLazyRoute(Login, "Login", "Loading page")} />
          <Route path="/reset-password" element={renderLazyRoute(ResetPassword, "Reset password", "Loading page")} />
          {mandatoryLogin ? (
            <Route path="*" element={<Navigate to="/login" replace />} />
          ) : (
            <Route path="*" element={<Navigate to={loginEntry} replace />} />
          )}
        </Routes>
      </div>
    );
  }

  if (!rbacReady) {
    return (
      <div className="app-shell">
        <VTLoader fullscreen />
      </div>
    );
  }

  return (
    <FleetFilterProvider>
    <DbProfileProvider>
    <DesktopScaleRoot enabled={!phoneMode && !(isMapTrackingRoute && isTabletDevice())}>
    <div
      className={`app-shell${hideOrgRibbon ? " app-shell--no-org-ribbon" : ""}${isMapTrackingRoute ? " app-shell--map-tracking" : ""}${phoneMode ? " app-shell--phone" : ""}`}
    >
      {phoneMode && <MobilePhoneHeader />}
      {!hideTopNav && <TopNav />}
      <TrialBanner />
      {!phoneMode && <OrgRibbon hideRibbon={isHistoricalTracking} />}
      <Routes>
        <Route
          path="/"
          element={
            nativeShell && !phoneMode ? (
              <Navigate to={nativeShellLandingPath} replace />
            ) : phoneMode ? (
              renderLazyRoute(MobileHome, "Home", "Loading page")
            ) : (
              renderLazyRoute(Home, "Home", "Loading page")
            )
          }
        />
        <Route path="/mobile" element={<Navigate to="/" replace />} />
        <Route path="/mobile/profile" element={renderLazyRoute(MobileProfile, "Profile", "Loading page")} />
        <Route path="/mobile/alerts" element={renderLazyRoute(MobileAlerts, "Alerts", "Loading page")} />
        <Route path="/mobile/preview" element={renderLazyRoute(MobilePreview, "Preview", "Loading page")} />
        <Route path="/mobile/personal-settings" element={renderLazyRoute(MobilePersonalSettings, "Personal Settings", "Loading page")} />
        <Route path="/share/live/:token" element={renderLazyRoute(LiveSharePublic, "Live share", "Loading page")} />
        <Route path="/login" element={renderLazyRoute(Login, "Login", "Loading page")} />
        {generatedRoutes.map((r) => (
          <Route
            key={r.path}
            path={r.path}
            element={renderProtectedRoute(r.path, customComponents[r.path], r.title, r.description, contextEpoch)}
          />
        ))}
        <Route
          path="/Track/videos/video-gallery"
          element={renderProtectedRoute(
            "/Track/videos/video-gallery",
            customComponents["/Track/videos/video-gallery"],
            "Video gallery",
            "Loading page",
            contextEpoch
          )}
        />
        <Route
          path="/Track/videos/live-video-streaming"
          element={renderProtectedRoute(
            "/Track/videos/live-video-streaming",
            customComponents["/Track/videos/live-video-streaming"],
            "Live video streaming",
            "Loading page",
            contextEpoch
          )}
        />
        <Route
          path="/Track/videos/device-remote-actions"
          element={renderProtectedRoute(
            "/Track/videos/device-remote-actions",
            customComponents["/Track/videos/device-remote-actions"],
            "Device remote actions",
            "Loading page",
            contextEpoch
          )}
        />
        <Route path="/Track/videos/808-gps" element={<Navigate to="/Track/videos/dashboard" replace />} />
        <Route path="*" element={<PageShell title="Not Found" description="The requested page does not exist." />} />
      </Routes>
      {modal && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setModal(null)}
        >
          <div className="admin-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <div className="admin-modal-title">{modal.title}</div>
                {modal.subtitle && <div className="admin-modal-sub">{modal.subtitle}</div>}
              </div>
              <button
                type="button"
                className="admin-modal-close"
                aria-label="Close"
                data-toast-ignore
                onClick={() => setModal(null)}
              >
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              {modal.fields.map((field) => (
                <label key={field} className="admin-modal-field">
                  <span>{field}</span>
                  <input
                    type="text"
                    value={modalValues[field] ?? ""}
                    placeholder={`Enter ${field.toLowerCase()}`}
                    onChange={(event) =>
                      setModalValues((current) => ({ ...current, [field]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="admin-modal-btn ghost"
                data-toast-ignore
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-modal-btn"
                data-toast-ignore
                onClick={() => {
                  if (modal) {
                    void saveToApi(`admin-modal:${modal.title}`, {
                      title: modal.title,
                      values: modalValues,
                      updatedAt: new Date().toISOString()
                    });
                  }
                  setModal(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      <DemoGuide />
      {phoneMode && <MobilePhoneBottomNav />}
    </div>
    </DesktopScaleRoot>
    </DbProfileProvider>
    </FleetFilterProvider>
  );
}
