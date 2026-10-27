const normalizeKey = (value: string) => String(value ?? "").trim().toLowerCase();

export const MOCK_CONFIG_GROUP_IDS = new Set(["cfg-1", "cfg-2", "cfg-3"]);

export const MOCK_CONFIG_GROUP_NAMES = new Set([
  "fuel haulers",
  "line haul",
  "new onboarding"
]);

export function isMockConfigurationGroup(group: { id?: string; name?: string }): boolean {
  const id = String(group.id ?? "").trim();
  const name = normalizeKey(String(group.name ?? ""));
  return MOCK_CONFIG_GROUP_IDS.has(id) || MOCK_CONFIG_GROUP_NAMES.has(name);
}

export function filterOutMockConfigurationGroups<T extends { id?: string; name?: string }>(
  groups: T[]
): T[] {
  return groups.filter((group) => !isMockConfigurationGroup(group));
}

export function purgeMockConfigurationGroupsFromLocalStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith("vivi.configGroups")) keys.push(key);
    }
    for (const key of keys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      const cleaned = filterOutMockConfigurationGroups(parsed);
      if (cleaned.length !== parsed.length) {
        window.localStorage.setItem(key, JSON.stringify(cleaned));
      }
    }
  } catch {
    // ignore
  }
}
