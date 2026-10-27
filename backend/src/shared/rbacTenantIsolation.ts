/** Keep RBAC user listings and updates scoped to one database (tenant) at a time. */

export function sanitizeRbacUserRowForTenant(row: Record<string, unknown>, tenantId: string): Record<string, unknown> {
  const scopedTenant = String(tenantId ?? "").trim();
  const siteIds = String(row.assignedSiteIds ?? row.assignedSiteId ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    ...row,
    assignedTenantId: scopedTenant,
    assignedTenantIds: scopedTenant,
    assignedSiteId: siteIds[0] ?? row.assignedSiteId ?? "",
    assignedSiteName: row.assignedSiteName ?? "",
    assignedSiteIds: siteIds.join(",")
  };
}

export function userRecordBelongsToTenant(user: { assignedTenantId?: string; id?: string }, tenantId: string, assignmentUserIds?: Set<string>) {
  const scopedTenant = String(tenantId ?? "").trim();
  if (!scopedTenant) return false;
  const userId = String(user?.id ?? "").trim();
  if (assignmentUserIds && userId && assignmentUserIds.has(userId)) return true;
  return String(user?.assignedTenantId ?? "").trim() === scopedTenant;
}
