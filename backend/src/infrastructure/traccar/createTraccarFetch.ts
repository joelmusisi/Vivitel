const buildBasicAuth = (user: string, pass: string) => Buffer.from(`${user}:${pass}`, "utf8").toString("base64");

interface CreateTraccarFetchDeps {
  getBaseUrl: () => string;
  getToken: () => string;
  getUsername: () => string;
  getPassword: () => string;
}

export function createTraccarFetch(deps: CreateTraccarFetchDeps) {
  const { getBaseUrl, getToken, getUsername, getPassword } = deps;

  return async function traccarFetch(pathnameWithQuery: string, init: RequestInit = {}) {
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      return { ok: false as const, status: 503, body: { error: "Traccar not configured" } };
    }

    const fetchFn = (globalThis as any).fetch as typeof fetch | undefined;
    if (!fetchFn) {
      return { ok: false as const, status: 500, body: { error: "fetch not available in runtime" } };
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(init.headers as any)
    };

    const token = getToken();
    const username = getUsername();
    const password = getPassword();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else if (username && password) {
      headers.Authorization = `Basic ${buildBasicAuth(username, password)}`;
    }

    const url = `${baseUrl}${pathnameWithQuery.startsWith("/") ? "" : "/"}${pathnameWithQuery}`;
    try {
      const resp = await fetchFn(url, { ...init, headers });
      const text = await resp.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      return { ok: resp.ok, status: resp.status, body };
    } catch (e: any) {
      return { ok: false as const, status: 502, body: { error: "Traccar request failed", message: e?.message ?? String(e) } };
    }
  };
}
