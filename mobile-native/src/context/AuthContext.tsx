import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { login as apiLogin, refreshAuthMe } from "../api/auth";
import { clearSession, getApiKey, getLastLoginEmail } from "../storage/session";

type AuthContextValue = {
  bootstrapping: boolean;
  signedIn: boolean;
  emailHint: string;
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [emailHint, setEmailHint] = useState("");

  const refresh = useCallback(async () => {
    const token = await getApiKey();
    if (!token) {
      setSignedIn(false);
      return;
    }
    const me = await refreshAuthMe();
    setSignedIn(Boolean(me));
  }, []);

  useEffect(() => {
    void (async () => {
      setEmailHint(await getLastLoginEmail());
      await refresh();
      setBootstrapping(false);
    })();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await apiLogin(email, password);
    if (result.ok) {
      setSignedIn(true);
      setEmailHint(email);
    }
    return result;
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setSignedIn(false);
  }, []);

  const value = useMemo(
    () => ({ bootstrapping, signedIn, emailHint, signIn, signOut, refresh }),
    [bootstrapping, signedIn, emailHint, signIn, signOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
