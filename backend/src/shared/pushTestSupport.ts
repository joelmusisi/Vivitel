/** Test helpers for the push notification tests (in-memory KV and a throwaway service account). */

export function createMemoryKv() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    async put(key: string, value: string) {
      store.set(key, String(value));
    },
    async delete(key: string) {
      store.delete(key);
    }
  };
}

function toPem(der: ArrayBuffer) {
  const bytes = new Uint8Array(der);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const lines = btoa(binary).match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

export async function createTestServiceAccount() {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  const privateKey = toPem((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer);
  const json = JSON.stringify({
    type: "service_account",
    project_id: "vivi-test",
    client_email: "push@vivi-test.iam.gserviceaccount.com",
    private_key: privateKey,
    token_uri: "https://oauth2.googleapis.com/token"
  });
  return { json, publicKey: pair.publicKey };
}

type Call = { url: string; body: string; headers: Record<string, string> };

/** Fake Google OAuth + FCM endpoints. `fcmStatus` picks the reply for each device token. */
export function createFakeFcmFetch(fcmStatus: (token: string) => { status: number; body?: unknown } = () => ({ status: 200 })) {
  const calls: Call[] = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    calls.push({ url: input, body, headers: (init?.headers ?? {}) as Record<string, string> });
    if (input.startsWith("https://oauth2.googleapis.com/")) {
      return new Response(JSON.stringify({ access_token: "access-1", expires_in: 3600 }), { status: 200 });
    }
    const token = String((JSON.parse(body) as { message?: { token?: string } }).message?.token ?? "");
    const reply = fcmStatus(token);
    return new Response(JSON.stringify(reply.body ?? { name: `projects/vivi-test/messages/${token}` }), {
      status: reply.status
    });
  };
  return { calls, fetchImpl };
}

export const UNREGISTERED_REPLY = {
  status: 404,
  body: {
    error: {
      code: 404,
      status: "NOT_FOUND",
      message: "Requested entity was not found.",
      details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "UNREGISTERED" }]
    }
  }
};
