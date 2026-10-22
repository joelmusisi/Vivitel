export const D1_CREDENTIAL_TABLES = new Set([
  "auth_admin_credentials",
  "auth_reset_tokens",
  "rbac_users",
  "rbac_roles",
  "rbac_security_groups",
  "rbac_user_roles",
  "rbac_user_groups",
  "rbac_group_roles",
  "rbac_user_tenants",
  "rbac_user_sites",
  "rbac_role_permissions",
  "rbac_user_regions"
]);

function stripSqlCommentsAndLiterals(sql: string): string {
  return String(sql ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .replace(/'(?:''|[^'])*'/g, " ")
    .replace(/"(?:\"\"|[^"])*"/g, " ")
    .replace(/`(?:``|[^`])*`/g, " ")
    .replace(/\[(?:[^\]])*\]/g, " ");
}

export function isD1WriteSql(sql: string): boolean {
  const text = stripSqlCommentsAndLiterals(sql);
  const writeCommand =
    /^\s*(?:insert|update|delete|replace|drop|create|alter|truncate|attach|detach|vacuum|reindex)\b/i;
  const withWriteCommand =
    /\b(?:insert|update|delete|replace|drop|create|alter|truncate|attach|detach|vacuum|reindex)\b/i;

  return text
    .split(";")
    .some((statement) =>
      /^\s*(?:with|explain)\b/i.test(statement)
        ? withWriteCommand.test(statement)
        : writeCommand.test(statement)
    );
}

/** Extract table names targeted by common SQL read, write, and DDL statements. */
export function extractD1WriteTables(sql: string): string[] {
  const text = String(sql ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .replace(/\s+/g, " ");
  const found = new Set<string>();

  const push = (value: unknown) => {
    const table = String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/^["`[]+|["`\]]+$/g, "");
    if (!table || table.startsWith("idx_")) return;
    found.add(table);
  };

  for (const match of text.matchAll(
    /\bcreate\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?["`]?[a-zA-Z_][\w]*["`]?\s+on\s+["`]?([a-zA-Z_][\w]*)["`]?/gi
  )) {
    push(match[1]);
  }

  const patterns: RegExp[] = [
    /\binsert\s+(?:or\s+\w+\s+)?into\s+["`]?([a-zA-Z_][\w]*)["`]?/gi,
    /\breplace\s+into\s+["`]?([a-zA-Z_][\w]*)["`]?/gi,
    /\bupdate\s+["`]?([a-zA-Z_][\w]*)["`]?/gi,
    /\bdelete\s+from\s+["`]?([a-zA-Z_][\w]*)["`]?/gi,
    /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-zA-Z_][\w]*)["`]?/gi,
    /\balter\s+table\s+["`]?([a-zA-Z_][\w]*)["`]?/gi,
    /\bdrop\s+table\s+(?:if\s+exists\s+)?["`]?([a-zA-Z_][\w]*)["`]?/gi,
    /\btruncate\s+(?:table\s+)?["`]?([a-zA-Z_][\w]*)["`]?/gi
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) push(match[1]);
  }
  return [...found];
}

export function extractOperationalSqlTables(sql: string): string[] {
  const text = String(sql ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .replace(/'(?:''|[^'])*'/g, " ")
    .replace(/\s+/g, " ");
  const tables = new Set<string>();
  const push = (value: string | undefined) => {
    const table = String(value ?? "")
      .trim()
      .replace(/^[`[\]]+|[`[\]]+$/g, "")
      .split(".")
      .pop()
      ?.toLowerCase();
    if (table && /^[a-z_][a-z0-9_]*$/.test(table)) tables.add(table);
  };

  for (const match of text.matchAll(
    /\b(?:from|join|update|into|table)\s+(?:if\s+not\s+exists\s+)?(?:(?:[`"]|\[)?[a-zA-Z_][\w$]*(?:[`"]|\])?\s*\.\s*)?(?:[`"]|\[)?([a-zA-Z_][\w$]*)(?:[`"]|\])?/gi
  )) {
    push(match[1]);
  }
  for (const table of extractD1WriteTables(sql)) push(table);
  return [...tables];
}

export function isAllowedCredentialD1Write(sql: string): boolean {
  if (!isD1WriteSql(sql)) return true;
  const tables = extractD1WriteTables(sql);
  return tables.length > 0 && tables.every((table) => D1_CREDENTIAL_TABLES.has(table));
}
