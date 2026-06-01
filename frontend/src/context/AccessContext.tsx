import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { getTenantId, getRbacUsers } from "../utils/api";
import {
  canAccessTenant,
  canViewPath,
  getSessionUserId,
  setSessionUserId,
  type AccessProfile
} from "../utils/accessControl";

type AccessContextValue = {
  profile: AccessProfile | null;
  loading: boolean;
  sessionUserId: string;
  setSessionUserId: (userId: string) => void;
  refresh: () => Promise<void>;
  canViewPath: (path: string) => boolean;
  canAccessTenant: (tenantId: string) => boolean;
};

const AccessContext = createContext<AccessContextValue | null>(null);

async function fetchProfile(userId: string): Promise<AccessProfile | null> {
  const apiBase = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) ?? "";
  const url = `${apiBase.replace(/\/$/, "")}/rbac/me?userId=${encodeURIComponent(userId)}`;
  try {
    const response = await fetch(url, {
      headers: {
        "content-type": "application/json",
        "x-tenant-id": getTenantId(),
        "x-user-id": userId
      }
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { profile: AccessProfile };
    return data.profile ?? null;
  } catch {
    return null;
  }
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionUserId, setSessionUserIdState] = useState(() => getSessionUserId());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      let userId = getSessionUserId();
      if (!userId) {
        const users = await getRbacUsers();
        const admin = users.find((u) => /admin/i.test(u.email));
        userId = admin?.id ?? users[0]?.id ?? "";
        if (userId) setSessionUserId(userId);
        setSessionUserIdState(userId);
      }
      if (!userId) {
        setProfile(null);
        return;
      }
      const next = await fetchProfile(userId);
      setProfile(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, sessionUserId]);

  useEffect(() => {
    const onSession = () => setSessionUserIdState(getSessionUserId());
    const onOrg = () => void refresh();
    window.addEventListener("vivi:sessionchange", onSession);
    window.addEventListener("vivi:orgchange", onOrg);
    return () => {
      window.removeEventListener("vivi:sessionchange", onSession);
      window.removeEventListener("vivi:orgchange", onOrg);
    };
  }, [refresh]);

  const value = useMemo<AccessContextValue>(
    () => ({
      profile,
      loading,
      sessionUserId,
      setSessionUserId: (userId: string) => {
        setSessionUserId(userId);
        setSessionUserIdState(userId);
      },
      refresh,
      canViewPath: (path: string) => canViewPath(profile, path),
      canAccessTenant: (tenantId: string) => canAccessTenant(profile, tenantId)
    }),
    [profile, loading, sessionUserId, refresh]
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used within AccessProvider");
  return ctx;
}
