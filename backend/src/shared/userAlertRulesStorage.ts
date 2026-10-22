export type UserAlertRuleRecord = Record<string, unknown> & { id: string };

export type AlertRulesKv = {
  get: (key: string) => Promise<string | null | undefined>;
  set: (key: string, value: string) => Promise<void>;
};

const USER_ALERT_RULES_PREFIX = "vivi:user-alert-rules:";

export function userAlertRulesKvKey(tenantId: string, userId: string) {
  return `${USER_ALERT_RULES_PREFIX}${String(tenantId ?? "").trim()}:${String(userId ?? "").trim()}`;
}

function normalizeId(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseRules(raw: string | null | undefined): UserAlertRuleRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const id = normalizeId((row as Record<string, unknown>).id);
        if (!id) return null;
        return { ...(row as Record<string, unknown>), id } as UserAlertRuleRecord;
      })
      .filter((row): row is UserAlertRuleRecord => Boolean(row));
  } catch {
    return [];
  }
}

export async function readUserAlertRules(
  kv: AlertRulesKv,
  tenantId: string,
  userId: string
): Promise<UserAlertRuleRecord[]> {
  const key = userAlertRulesKvKey(tenantId, userId);
  const raw = await kv.get(key);
  return parseRules(raw);
}

async function writeUserAlertRules(
  kv: AlertRulesKv,
  tenantId: string,
  userId: string,
  rules: UserAlertRuleRecord[]
): Promise<void> {
  const key = userAlertRulesKvKey(tenantId, userId);
  await kv.set(key, JSON.stringify(rules));
}

export async function upsertUserAlertRule(
  kv: AlertRulesKv,
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
  generateId: () => string
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const id = normalizeId(body.id) || generateId();
  const rules = await readUserAlertRules(kv, tenantId, userId);
  const now = new Date().toISOString();
  const next: UserAlertRuleRecord = {
    ...body,
    id,
    tenantId,
    userId,
    updatedAt: now,
    ...(normalizeId(body.createdAt) ? {} : { createdAt: now })
  };
  const index = rules.findIndex((row) => row.id === id);
  if (index >= 0) rules[index] = { ...rules[index], ...next };
  else rules.push(next);
  await writeUserAlertRules(kv, tenantId, userId, rules);
  return { ok: true, id };
}

export async function deleteUserAlertRule(
  kv: AlertRulesKv,
  tenantId: string,
  userId: string,
  id: string
): Promise<boolean> {
  const normalizedId = normalizeId(id);
  if (!normalizedId) return false;
  const rules = await readUserAlertRules(kv, tenantId, userId);
  const next = rules.filter((row) => row.id !== normalizedId);
  if (next.length === rules.length) return false;
  await writeUserAlertRules(kv, tenantId, userId, next);
  return true;
}
