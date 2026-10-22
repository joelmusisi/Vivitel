import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  apiKey: "vivi.apiKey",
  tenantId: "vivi.tenantId",
  email: "vivi.auth.lastLoginEmail",
  principal: "vivi.auth.principal"
} as const;

export async function getApiKey(): Promise<string> {
  return String((await AsyncStorage.getItem(KEYS.apiKey)) ?? "").trim();
}

export async function setApiKey(value: string): Promise<void> {
  const token = String(value ?? "").trim();
  if (!token) {
    await Promise.all([
      AsyncStorage.removeItem(KEYS.apiKey),
      AsyncStorage.removeItem(KEYS.tenantId),
      AsyncStorage.removeItem(KEYS.principal)
    ]);
    return;
  }
  await AsyncStorage.setItem(KEYS.apiKey, token);
}

export async function getTenantId(): Promise<string> {
  return String((await AsyncStorage.getItem(KEYS.tenantId)) ?? "").trim();
}

export async function setTenantId(value: string): Promise<void> {
  const tenant = String(value ?? "").trim();
  if (!tenant) {
    await AsyncStorage.removeItem(KEYS.tenantId);
    return;
  }
  await AsyncStorage.setItem(KEYS.tenantId, tenant);
}

export async function setLastLoginEmail(email: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.email, String(email ?? "").trim());
}

export async function getLastLoginEmail(): Promise<string> {
  return String((await AsyncStorage.getItem(KEYS.email)) ?? "").trim();
}

export async function clearSession(): Promise<void> {
  await Promise.all(Object.values(KEYS).map((key) => AsyncStorage.removeItem(key)));
}
