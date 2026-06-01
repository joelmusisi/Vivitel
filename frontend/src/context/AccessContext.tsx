import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { getAccessProfile, getTenantId } from "../utils/api";
import {
  canAccessTenant,
  canViewPath,
  clearSession,
  getSessionToken,
  getSessionUserId,
  setSessionUserId,
  type AccessProfile
} from "../utils/accessControl";

type AccessContextValue = {
  profile: AccessProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  sessionUserId: string;
  logout: () => void;
  refresh: () => Promise<void>;
  canViewPath: (path: string) => boolean;
  canAccessTenant: (tenantId: string) => boolean;
};

const AccessContext = createContext<AccessContextValue | null>(null);

export function AccessProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionUserId, setSessionUserIdState] = useState(() => getSessionUserId());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = getSessionToken();
      const userId = getSessionUserId();
      if (!token || !userId) {
        setProfile(null);
        return;
      }
      const next = await getAccessProfile(userId);
      setProfile(next);
      if (next?.userId) {
        setSessionUserId(next.userId);
        setSessionUserIdState(next.userId);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onSession = () => {
      setSessionUserIdState(getSessionUserId());
      void refresh();
    };
    const onOrg = () => void refresh();
    window.addEventListener("vivi:sessionchange", onSession);
    window.addEventListener("vivi:orgchange", onOrg);
    return () => {
      window.removeEventListener("vivi:sessionchange", onSession);
      window.removeEventListener("vivi:orgchange", onOrg);
    };
  }, [refresh]);

  const logout = useCallback(() => {
    clearSession();
    setProfile(null);
    setSessionUserIdState("");
    window.dispatchEvent(new Event("vivi:sessionchange"));
  }, []);

  const value = useMemo<AccessContextValue>(
    () => ({
      profile,
      loading,
      isAuthenticated: Boolean(getSessionToken() && profile),
      sessionUserId,
      logout,
      refresh,
      canViewPath: (path: string) => {
        if (path === "/login") return true;
        return canViewPath(profile, path);
      },
      canAccessTenant: (tenantId: string) => canAccessTenant(profile, tenantId)
    }),
    [profile, loading, sessionUserId, logout, refresh]
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used within AccessProvider");
  return ctx;
}
