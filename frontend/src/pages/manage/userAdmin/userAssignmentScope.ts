import { uniqStrings } from "./rbacApi";
import type { DatabaseOption, SiteOption } from "./types";

export type AssignmentPickerFlags = {
  showAssignDealer: boolean;
  showAssignOrganisation: boolean;
  showAssignDatabase: boolean;
};

export function filterDatabasesForAssignee(
  allDbs: DatabaseOption[],
  selectedDealerIds: string[],
  selectedOrgIds: string[],
  flags: AssignmentPickerFlags
): DatabaseOption[] {
  return allDbs.filter((db) => {
    if (flags.showAssignDealer && selectedDealerIds.length && !selectedDealerIds.includes(db.dealerId)) return false;
    if (flags.showAssignOrganisation && selectedOrgIds.length && !selectedOrgIds.includes(db.orgId)) return false;
    return true;
  });
}

export function filterSitesForAssignee(
  allSites: SiteOption[],
  selectedDealerIds: string[],
  selectedOrgIds: string[],
  selectedDbIds: string[],
  flags: AssignmentPickerFlags
): SiteOption[] {
  return allSites.filter((site) => {
    if (flags.showAssignDealer) {
      if (!selectedDealerIds.length) return false;
      if (!selectedDealerIds.includes(site.dealerId)) return false;
    }
    if (flags.showAssignOrganisation) {
      if (!selectedOrgIds.length) return false;
      if (!selectedOrgIds.includes(site.orgId)) return false;
    }
    if (flags.showAssignDatabase && selectedDbIds.length && !selectedDbIds.includes(site.dbId)) return false;
    return true;
  });
}

export function collectAssignmentTenantIds(input: {
  selectedTenantIds: string[];
  siteTenantIds: string[];
  dealerScopedTenantIds: string[];
  orgScopedTenantIds: string[];
  selectedDealerIds: string[];
  selectedOrgIds: string[];
  flags: AssignmentPickerFlags;
  fallbackTenantId?: string;
}): string[] {
  const impliedFromDealers =
    !input.flags.showAssignDatabase && input.selectedDealerIds.length ? input.dealerScopedTenantIds : [];
  const impliedFromOrgs =
    input.flags.showAssignOrganisation && !input.flags.showAssignDatabase && input.selectedOrgIds.length
      ? input.orgScopedTenantIds
      : [];
  const ids = uniqStrings([
    ...input.selectedTenantIds,
    ...input.siteTenantIds,
    ...impliedFromDealers,
    ...impliedFromOrgs
  ]);
  if (ids.length) return ids;
  const fallback = String(input.fallbackTenantId ?? "").trim();
  return fallback ? [fallback] : [];
}

export function resolveEditSaveTenantId(input: {
  editingUserTenantId?: string;
  activeTenantId?: string;
  resolvedRoleTenantId?: string;
  assignmentTenantIds: string[];
  siteTenantIds: string[];
}): string {
  const editing = String(input.editingUserTenantId ?? "").trim();
  if (editing) return editing;
  const active = String(input.activeTenantId ?? "").trim();
  if (active) return active;
  return String(
    input.resolvedRoleTenantId || input.assignmentTenantIds[0] || input.siteTenantIds[0] || ""
  ).trim();
}
