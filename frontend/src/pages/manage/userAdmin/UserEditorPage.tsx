import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  canForPath,
  getCachedPrincipal,
  getHierarchy,
  getTenantId,
  syncHierarchyTree
} from "../../../utils/api";
import {
  buildUserRolePickerOptions,
  isStandardRoleName,
  sortRolesByPrivilege,
  STANDARD_ROLES
} from "../../../utils/standardRoles";
import {
  resolveRoleScopeRulesByName,
  resolveRoleScopeRulesFromPrincipal,
  standardRoleScopeSummary,
  validateAssignmentDraft,
  validateEditorAssignmentDraft
} from "../../../utils/roleScopeRules";
import { showToast } from "../../../utils/toast";
import { beginSaving, endSavingDone, endSavingError } from "../../../utils/saveFeedback";
import AllocationChoices from "./AllocationChoices";
import {
  collectAssignmentTenantIds,
  filterDatabasesForAssignee,
  filterSitesForAssignee,
  resolveEditSaveTenantId
} from "./userAssignmentScope";
import { parseUserAdminRoute, USERS_PATH, SECURITY_GROUPS_PATH } from "./paths";
import {
  buildSelectedAllocationLabel,
  parseIdList,
  isDuplicateUserEmailError,
  pickRbacUserFromResponse,
  RbacApiError,
  rbacApiJson,
  recoverUserAdminTenantId,
  resolveRoleIdAcrossTenants,
  toRolePickerRow,
  toggleId,
  uniqStrings,
  USER_EXISTS_POPUP
} from "./rbacApi";
import type {
  DatabaseOption,
  Dealer,
  OrganisationOption,
  RbacGroup,
  RbacRole,
  RbacUser,
  SiteOption,
  UserScopeDraft
} from "./types";
import "../../../index.css";

export default function UserEditorPage({ mode, entityId }: { mode: "create" | "edit"; entityId?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const route = parseUserAdminRoute(location.pathname);
  const editingId = mode === "edit" ? String(entityId || route.entityId || params.userId || "").trim() : "";
  const stagedUser = (location.state as { user?: RbacUser } | null | undefined)?.user;
  const tenantId = recoverUserAdminTenantId() || getTenantId();
  const canEdit = canForPath(USERS_PATH, "edit");
  const principal = getCachedPrincipal()?.principal ?? null;
  const allowedTenants = Array.isArray(getCachedPrincipal()?.allowedTenants) ? getCachedPrincipal()!.allowedTenants : [];
  const principalKind = String(principal?.kind ?? "").toLowerCase();
  const hasOwnSupportRights =
    principalKind === "admin" || Boolean((principal as any)?.isOwnSupport) || Boolean((principal as any)?.isTenantAdmin);
  const hasSupportRights =
    hasOwnSupportRights || Boolean((principal as any)?.isSupport) || Boolean((principal as any)?.isDealerSupport);
  const hasDealerSupportRights = Boolean((principal as any)?.isDealerSupport) && !hasOwnSupportRights;

  const [busy, setBusy] = useState(false);
  const [userSaveError, setUserSaveError] = useState<string | null>(null);
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [userRoleOptions, setUserRoleOptions] = useState<RbacRole[]>([]);
  const [groups, setGroups] = useState<RbacGroup[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [userDraft, setUserDraft] = useState({
    name: String(stagedUser?.id === editingId ? stagedUser?.name ?? "" : ""),
    email: String(stagedUser?.id === editingId ? stagedUser?.email ?? "" : ""),
    roleId: String(stagedUser?.id === editingId ? stagedUser?.assignedRoleId ?? "" : ""),
    sendInvite: mode !== "edit"
  });
  const [orgTree, setOrgTree] = useState<Dealer[]>([]);
  const [creatorPath, setCreatorPath] = useState<string[]>([]);
  const [userScopeDraft, setUserScopeDraft] = useState<UserScopeDraft>({ dealerIds: [], orgIds: [], dbIds: [], siteIds: [] });
  const [editingUserTenantId, setEditingUserTenantId] = useState("");
  const [editingUserRoleName, setEditingUserRoleName] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const readOrgTree = () => {
      try {
        const raw = window.localStorage.getItem("vivi.org.dealers");
        if (!raw) return [] as Dealer[];
        const parsed = JSON.parse(raw) as Dealer[];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [] as Dealer[];
      }
    };
    const resolveCreatorPath = (tree: Dealer[]) => {
      const rawTenant = String(tenantId ?? "").trim();
      const tenantParts = rawTenant.split(":").map((v) => v.trim()).filter(Boolean);
      if (tenantParts.length >= 3) return tenantParts.slice(0, 3);
      const selectedPath = String(window.localStorage.getItem("vivi.selectedPath") ?? "").trim();
      const nameParts = selectedPath.split("/").map((v) => v.trim()).filter(Boolean);
      if (nameParts.length >= 3) {
        const [dealerName, orgName, dbName] = nameParts;
        const dealer = tree.find((d) => String(d.name ?? "").trim() === dealerName) ?? null;
        const org = dealer?.organisations?.find((o) => String(o.name ?? "").trim() === orgName) ?? null;
        const db = org?.databases?.find((d) => String(d.name ?? "").trim() === dbName) ?? null;
        const resolved = [dealer?.id, org?.id, db?.id].filter(Boolean) as string[];
        if (resolved.length >= 3) return resolved;
      }
      return [] as string[];
    };
    const syncFromStorage = () => {
      const tree = readOrgTree();
      setOrgTree(tree);
      setCreatorPath(resolveCreatorPath(tree));
    };
    syncFromStorage();
    void (async () => {
      try {
        const hierarchy = await getHierarchy();
        const rows = Array.isArray(hierarchy?.dealers) ? (hierarchy.dealers as Dealer[]) : [];
        const localRows = readOrgTree();
        const countNodes = (tree: Dealer[]) =>
          tree.reduce((total, dealer) => {
            let n = total + 1;
            for (const org of dealer.organisations ?? []) {
              n += 1;
              for (const db of org.databases ?? []) n += 1 + (db.sites?.length ?? 0);
            }
            return n;
          }, 0);
        if (rows.length === 0 && countNodes(localRows) > 0 && localRows.length) {
          try {
            const healed = await syncHierarchyTree(localRows as any);
            const healedRows = Array.isArray(healed?.hierarchy?.dealers) ? (healed!.hierarchy!.dealers as Dealer[]) : localRows;
            setOrgTree(healedRows);
            setCreatorPath(resolveCreatorPath(healedRows));
            return;
          } catch {
            setOrgTree(localRows);
            setCreatorPath(resolveCreatorPath(localRows));
            return;
          }
        }
        if (!rows.length) return;
        setOrgTree(rows);
        setCreatorPath(resolveCreatorPath(rows));
      } catch {
        /* keep local */
      }
    })();
    const onOrgChange = () => syncFromStorage();
    window.addEventListener("vivi:orgchange", onOrgChange);
    window.addEventListener("storage", onOrgChange);
    return () => {
      window.removeEventListener("vivi:orgchange", onOrgChange);
      window.removeEventListener("storage", onOrgChange);
    };
  }, [tenantId]);

  const creatorLevel = useMemo<"dealer" | "org" | "db">(() => {
    if (creatorPath.length >= 3) return "db";
    if (creatorPath.length === 2) return "org";
    return "dealer";
  }, [creatorPath]);
  const creatorDealerId = creatorPath[0] ?? "";
  const creatorOrgId = creatorPath[1] ?? "";
  const creatorDbId = creatorPath[2] ?? "";

  const assignedDealerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const tenant of allowedTenants) {
      const dealerId = String(tenant ?? "").split(":")[0]?.trim();
      if (dealerId) ids.add(dealerId);
    }
    return ids;
  }, [allowedTenants]);

  const scopedOrgTree = useMemo(() => {
    const isUnrestrictedEditor =
      principalKind === "admin" || Boolean((principal as any)?.isTenantAdmin) || Boolean((principal as any)?.isOwnSupport);
    if (isUnrestrictedEditor) return orgTree;
    if (!allowedTenants.length) return [] as Dealer[];
    const allowed = new Set(allowedTenants.map((value: string) => String(value ?? "").trim()).filter(Boolean));
    return orgTree
      .map((dealer) => ({
        ...dealer,
        organisations: (dealer.organisations ?? [])
          .map((org) => ({
            ...org,
            databases: (org.databases ?? []).filter((db) => allowed.has(`${dealer.id}:${org.id}:${db.id}`))
          }))
          .filter((org) => (org.databases ?? []).length > 0)
      }))
      .filter((dealer) => (dealer.organisations ?? []).some((org) => (org.databases ?? []).length > 0));
  }, [allowedTenants, orgTree, principal, principalKind]);

  const availableDealers = useMemo(() => {
    const isUnrestrictedEditor =
      principalKind === "admin" || Boolean((principal as any)?.isTenantAdmin) || Boolean((principal as any)?.isOwnSupport);
    if (isUnrestrictedEditor) return scopedOrgTree;
    if (hasDealerSupportRights) return scopedOrgTree.filter((dealer) => assignedDealerIds.has(dealer.id));
    const creatorDealer = scopedOrgTree.find((d) => d.id === creatorDealerId) ?? null;
    return creatorDealer ? [creatorDealer] : [];
  }, [assignedDealerIds, creatorDealerId, hasDealerSupportRights, principal, principalKind, scopedOrgTree]);

  const availableDealerIds = useMemo(() => new Set(availableDealers.map((dealer) => dealer.id)), [availableDealers]);
  const allOrgOptions = useMemo<OrganisationOption[]>(
    () => availableDealers.flatMap((dealer) => (dealer.organisations ?? []).map((org) => ({ id: org.id, name: org.name, dealerId: dealer.id }))),
    [availableDealers]
  );
  const selectedDealerIds = useMemo(
    () => userScopeDraft.dealerIds.filter((dealerId) => availableDealerIds.has(dealerId)),
    [availableDealerIds, userScopeDraft.dealerIds]
  );
  const availableOrgs = useMemo(
    () => allOrgOptions.filter((org) => selectedDealerIds.includes(org.dealerId)),
    [allOrgOptions, selectedDealerIds]
  );
  const availableOrgIds = useMemo(() => new Set(availableOrgs.map((org) => org.id)), [availableOrgs]);
  const selectedOrgIds = useMemo(
    () => userScopeDraft.orgIds.filter((orgId) => availableOrgIds.has(orgId)),
    [availableOrgIds, userScopeDraft.orgIds]
  );
  const allDbOptions = useMemo<DatabaseOption[]>(
    () =>
      availableDealers.flatMap((dealer) =>
        (dealer.organisations ?? []).flatMap((org) =>
          (org.databases ?? []).map((db) => ({
            id: db.id,
            name: db.name,
            dealerId: dealer.id,
            orgId: org.id,
            tenantId: `${dealer.id}:${org.id}:${db.id}`
          }))
        )
      ),
    [availableDealers]
  );
  const assigneeRoleName = useMemo(() => {
    const role =
      userRoleOptions.find((row) => row.id === userDraft.roleId) ?? roles.find((row) => row.id === userDraft.roleId) ?? null;
    const key = String(role?.standardRoleKey ?? "").trim().toLowerCase();
    const fromKey = STANDARD_ROLES.find((row) => row.key === key)?.name ?? "";
    const groupDrivenDatabaseSupport = groups.some(
      (g) => groupIds.includes(g.id) && /^database support\b/i.test(String(g.name ?? "").trim())
    );
    if (groupDrivenDatabaseSupport && !/^(admin|own support)$/i.test(fromKey || String(role?.name ?? "").trim())) {
      return "Database Support";
    }
    return fromKey || String(role?.name ?? "").trim();
  }, [groupIds, groups, roles, userDraft.roleId, userRoleOptions]);
  const assigneeRoleScope = useMemo(() => resolveRoleScopeRulesByName(assigneeRoleName), [assigneeRoleName]);
  const actorScope = useMemo(() => resolveRoleScopeRulesFromPrincipal(principal), [principal]);

  const assignmentPickerFlags = useMemo(
    () => ({
      showAssignDealer: assigneeRoleScope.canAssignDealer && actorScope.visibility.showOrganisation,
      showAssignOrganisation:
        assigneeRoleScope.canAssignOrganisation && actorScope.visibility.showDealer && !assigneeRoleScope.flattenOrganisations,
      showAssignDatabase:
        assigneeRoleScope.canAssignDatabase && (actorScope.visibility.showDatabase || assigneeRoleScope.key === "database-support")
    }),
    [
      actorScope.visibility.showDatabase,
      assigneeRoleScope.key,
      actorScope.visibility.showDealer,
      actorScope.visibility.showOrganisation,
      assigneeRoleScope.canAssignDatabase,
      assigneeRoleScope.canAssignDealer,
      assigneeRoleScope.canAssignOrganisation,
      assigneeRoleScope.flattenOrganisations
    ]
  );
  const dbOptionsForAssignee = useMemo(() => {
    if (assigneeRoleScope.databaseOnlyNavigation || assigneeRoleScope.flattenOrganisations) {
      if (selectedDealerIds.length > 0) return allDbOptions.filter((db) => selectedDealerIds.includes(db.dealerId));
      return allDbOptions;
    }
    return filterDatabasesForAssignee(allDbOptions, selectedDealerIds, selectedOrgIds, assignmentPickerFlags);
  }, [
    allDbOptions,
    assignmentPickerFlags,
    assigneeRoleScope.databaseOnlyNavigation,
    assigneeRoleScope.flattenOrganisations,
    selectedDealerIds,
    selectedOrgIds
  ]);
  const dbOptionsForAssigneeIds = useMemo(() => new Set(dbOptionsForAssignee.map((db) => db.id)), [dbOptionsForAssignee]);
  const selectedDbIdsForAssignee = useMemo(
    () => userScopeDraft.dbIds.filter((dbId) => dbOptionsForAssigneeIds.has(dbId)),
    [dbOptionsForAssigneeIds, userScopeDraft.dbIds]
  );
  const allSiteOptions = useMemo<SiteOption[]>(
    () =>
      availableDealers.flatMap((dealer) =>
        (dealer.organisations ?? []).flatMap((org) =>
          (org.databases ?? []).flatMap((db) =>
            (db.sites ?? []).map((site) => ({
              id: site.id,
              name: site.name,
              dealerId: dealer.id,
              orgId: org.id,
              dbId: db.id,
              tenantId: `${dealer.id}:${org.id}:${db.id}`
            }))
          )
        )
      ),
    [availableDealers]
  );
  const availableSites = useMemo(() => {
    // Own Support covers every site under the chosen dealers. A single database must not hide the rest.
    if (assigneeRoleScope.key === "own-support") {
      if (selectedDealerIds.length) return allSiteOptions.filter((site) => selectedDealerIds.includes(site.dealerId));
      return allSiteOptions;
    }
    if (!actorScope.visibility.showDatabase && assigneeRoleScope.key !== "database-support") {
      if (selectedDealerIds.length) return allSiteOptions.filter((site) => selectedDealerIds.includes(site.dealerId));
      return allSiteOptions;
    }
    if (assigneeRoleScope.databaseOnlyNavigation || assigneeRoleScope.flattenOrganisations) {
      if (selectedDbIdsForAssignee.length) return allSiteOptions.filter((site) => selectedDbIdsForAssignee.includes(site.dbId));
      if (selectedDealerIds.length) return allSiteOptions.filter((site) => selectedDealerIds.includes(site.dealerId));
      return allSiteOptions;
    }
    return filterSitesForAssignee(
      allSiteOptions,
      selectedDealerIds,
      selectedOrgIds,
      selectedDbIdsForAssignee,
      assignmentPickerFlags
    );
  }, [
    actorScope.visibility.showDatabase,
    assigneeRoleScope.key,
    allSiteOptions,
    assignmentPickerFlags,
    assigneeRoleScope.databaseOnlyNavigation,
    assigneeRoleScope.flattenOrganisations,
    selectedDbIdsForAssignee,
    selectedDealerIds,
    selectedOrgIds
  ]);
  const availableSiteIds = useMemo(() => new Set(availableSites.map((site) => site.id)), [availableSites]);
  const selectedSiteIds = useMemo(
    () => userScopeDraft.siteIds.filter((siteId) => availableSiteIds.has(siteId)),
    [availableSiteIds, userScopeDraft.siteIds]
  );
  const selectedTenantIds = useMemo(
    () => uniqStrings(dbOptionsForAssignee.filter((db) => selectedDbIdsForAssignee.includes(db.id)).map((db) => db.tenantId)),
    [dbOptionsForAssignee, selectedDbIdsForAssignee]
  );
  const primarySelectedTenantId = selectedTenantIds[0] ?? "";

  const scopeHint = useMemo(() => {
    if (assigneeRoleName) {
      const summary = standardRoleScopeSummary(assigneeRoleName);
      if (summary) return summary;
    }
    if (hasOwnSupportRights) return "Own Support: choose Dealers, Databases, and Sites across the platform (organisations are hidden).";
    if (hasDealerSupportRights) return "Dealer Support: choose dealers and sites within your assigned dealer(s).";
    if (hasSupportRights) return "Support-level editor: choose one or more Dealers, Organisations, Databases, and Sites.";
    if (creatorLevel === "db") return "DB-level creator: Organisation and Database are fixed; choose one or more Sites.";
    if (creatorLevel === "org") return "Organisation-level creator: Organisation is fixed; choose one or more Databases and Sites.";
    return "Dealer-level creator: choose one or more Organisations, Databases, and Sites.";
  }, [assigneeRoleName, creatorLevel, hasDealerSupportRights, hasOwnSupportRights, hasSupportRights]);

  const selectedAllocationLabel = useMemo(
    () =>
      buildSelectedAllocationLabel(
        [
          actorScope.visibility.showOrganisation
            ? { label: "Dealers", values: availableDealers.filter((d) => selectedDealerIds.includes(d.id)).map((d) => d.name) }
            : null,
          actorScope.visibility.showDealer
            ? { label: "Organisations", values: availableOrgs.filter((o) => selectedOrgIds.includes(o.id)).map((o) => o.name) }
            : null,
          actorScope.visibility.showDatabase
            ? { label: "Databases", values: dbOptionsForAssignee.filter((d) => selectedDbIdsForAssignee.includes(d.id)).map((d) => d.name) }
            : null,
          actorScope.visibility.showSite
            ? { label: "Sites", values: availableSites.filter((s) => selectedSiteIds.includes(s.id)).map((s) => s.name) }
            : null
        ].filter(Boolean) as Array<{ label: string; values: string[] }>
      ),
    [
      actorScope.visibility.showDatabase,
      actorScope.visibility.showDealer,
      actorScope.visibility.showOrganisation,
      actorScope.visibility.showSite,
      availableDealers,
      availableOrgs,
      availableSites,
      dbOptionsForAssignee,
      selectedDealerIds,
      selectedDbIdsForAssignee,
      selectedOrgIds,
      selectedSiteIds
    ]
  );

  const showAssignDealer = assignmentPickerFlags.showAssignDealer;
  const showAssignOrganisation = assignmentPickerFlags.showAssignOrganisation;
  const showAssignDatabase = assignmentPickerFlags.showAssignDatabase;
  const showAssignSite = assigneeRoleScope.canAssignSite && actorScope.visibility.showSite;
  const siteSingleSelect = assigneeRoleScope.key !== "own-support" && assigneeRoleScope.maxSites === 1;

  const chooseDealer = (dealerId: string) => {
    setUserScopeDraft((current) => {
      const dealerIds = toggleId(current.dealerIds, dealerId);
      const impliedOrgIds = allOrgOptions.filter((org) => dealerIds.includes(org.dealerId)).map((org) => org.id);
      const orgIds = showAssignOrganisation
        ? current.orgIds.filter((orgId) => impliedOrgIds.includes(orgId))
        : impliedOrgIds;
      const allowedDbs = allDbOptions.filter(
        (db) =>
          dealerIds.includes(db.dealerId) &&
          (assigneeRoleScope.databaseOnlyNavigation ||
            assigneeRoleScope.flattenOrganisations ||
            !showAssignOrganisation ||
            orgIds.includes(db.orgId))
      );
      const allowedDbIds = new Set(allowedDbs.map((db) => db.id));
      const dbIds = showAssignDatabase ? current.dbIds.filter((dbId) => allowedDbIds.has(dbId)) : Array.from(allowedDbIds);
      const allowedSiteIds =
        assigneeRoleScope.key === "own-support"
          ? new Set(
              (dealerIds.length ? allSiteOptions.filter((site) => dealerIds.includes(site.dealerId)) : allSiteOptions).map(
                (site) => site.id
              )
            )
          : new Set(
              filterSitesForAssignee(allSiteOptions, dealerIds, orgIds, dbIds, {
                showAssignDealer: true,
                showAssignOrganisation,
                showAssignDatabase
              }).map((site) => site.id)
            );
      const siteIds = current.siteIds.filter((siteId) => allowedSiteIds.has(siteId));
      return { dealerIds, orgIds, dbIds, siteIds };
    });
  };
  const chooseOrganisation = (orgId: string) => {
    setUserScopeDraft((current) => {
      const orgIds = toggleId(current.orgIds, orgId);
      const allowedDbIds = new Set(
        allDbOptions.filter((db) => current.dealerIds.includes(db.dealerId) && orgIds.includes(db.orgId)).map((db) => db.id)
      );
      const dbIds = showAssignDatabase ? current.dbIds.filter((dbId) => allowedDbIds.has(dbId)) : Array.from(allowedDbIds);
      const allowedSiteIds =
        assigneeRoleScope.key === "own-support"
          ? new Set(
              (current.dealerIds.length
                ? allSiteOptions.filter((site) => current.dealerIds.includes(site.dealerId))
                : allSiteOptions
              ).map((site) => site.id)
            )
          : new Set(
              filterSitesForAssignee(allSiteOptions, current.dealerIds, orgIds, dbIds, assignmentPickerFlags).map(
                (site) => site.id
              )
            );
      const siteIds = current.siteIds.filter((siteId) => allowedSiteIds.has(siteId));
      return { ...current, orgIds, dbIds, siteIds };
    });
  };
  const chooseDatabase = (dbId: string) => {
    setUserScopeDraft((current) => {
      const dbIds =
        assigneeRoleScope.key === "database-support"
          ? current.dbIds.includes(dbId)
            ? []
            : [dbId]
          : toggleId(current.dbIds, dbId);
      const allowedSiteIds =
        assigneeRoleScope.key === "own-support"
          ? new Set(
              (current.dealerIds.length
                ? allSiteOptions.filter((site) => current.dealerIds.includes(site.dealerId))
                : allSiteOptions
              ).map((site) => site.id)
            )
          : new Set(
              filterSitesForAssignee(allSiteOptions, current.dealerIds, current.orgIds, dbIds, assignmentPickerFlags).map(
                (site) => site.id
              )
            );
      const siteIds = current.siteIds.filter((siteId) => allowedSiteIds.has(siteId));
      return { ...current, dbIds, siteIds };
    });
  };
  const chooseSite = (siteId: string) => {
    setUserScopeDraft((current) => {
      const nextId = String(siteId ?? "").trim();
      if (!nextId) return current;
      if (assigneeRoleScope.key !== "own-support" && assigneeRoleScope.maxSites === 1) {
        return { ...current, siteIds: current.siteIds.includes(nextId) ? [] : [nextId] };
      }
      return { ...current, siteIds: toggleId(current.siteIds, siteId) };
    });
  };

  useEffect(() => {
    if (showAssignOrganisation && showAssignDatabase) return;
    setUserScopeDraft((current) => {
      const dealerIds = current.dealerIds.filter((id) => availableDealerIds.has(id));
      const impliedOrgIds = allOrgOptions.filter((org) => dealerIds.includes(org.dealerId)).map((org) => org.id);
      const orgIds = showAssignOrganisation ? current.orgIds.filter((id) => impliedOrgIds.includes(id)) : impliedOrgIds;
      const impliedDbIds = allDbOptions
        .filter((db) => dealerIds.includes(db.dealerId) && (!orgIds.length || orgIds.includes(db.orgId)))
        .map((db) => db.id);
      const dbIds = showAssignDatabase ? current.dbIds.filter((id) => impliedDbIds.includes(id)) : impliedDbIds;
      if (orgIds.join("|") === current.orgIds.join("|") && dbIds.join("|") === current.dbIds.join("|")) return current;
      return { ...current, orgIds, dbIds };
    });
  }, [allDbOptions, allOrgOptions, availableDealerIds, showAssignDatabase, showAssignOrganisation]);

  const createScopeSeededRef = useRef(false);
  const ownSupportDefaultSiteClearedRef = useRef(false);
  // Defaults for create. Own Support is not pinned to the first site.
  useEffect(() => {
    if (mode !== "create" || editingId) return;
    const defaultDealerId = hasSupportRights ? availableDealers[0]?.id ?? creatorDealerId : creatorDealerId;
    const defaultDealer = availableDealers.find((d) => d.id === defaultDealerId) ?? availableDealers[0] ?? null;
    const defaultOrgId =
      hasSupportRights
        ? defaultDealer?.organisations?.[0]?.id ?? ""
        : creatorLevel !== "dealer"
          ? creatorOrgId
          : defaultDealer?.organisations?.[0]?.id ?? "";
    const defaultOrg = (defaultDealer?.organisations ?? []).find((o) => o.id === defaultOrgId) ?? defaultDealer?.organisations?.[0] ?? null;
    const defaultDbId = creatorLevel === "db" ? creatorDbId : defaultOrg?.databases?.[0]?.id ?? "";
    const defaultDb = (defaultOrg?.databases ?? []).find((d) => d.id === defaultDbId) ?? defaultOrg?.databases?.[0] ?? null;
    const defaultSiteId = defaultDb?.sites?.[0]?.id ?? "";
    const seeded = {
      dealerIds: defaultDealerId ? [defaultDealerId] : [],
      orgIds: defaultOrgId ? [defaultOrgId] : [],
      dbIds: defaultDbId ? [defaultDbId] : [],
      siteIds: defaultSiteId ? [defaultSiteId] : []
    };
    setUserScopeDraft((current) => {
      const hasSelection = current.dealerIds.length > 0 || current.dbIds.length > 0 || current.siteIds.length > 0;
      if (assigneeRoleScope.key === "own-support") {
        if (!ownSupportDefaultSiteClearedRef.current) {
          ownSupportDefaultSiteClearedRef.current = true;
          if (!hasSelection) return { ...seeded, siteIds: [] };
          const onlyAutoSite = Boolean(defaultSiteId) && current.siteIds.length === 1 && current.siteIds[0] === defaultSiteId;
          return onlyAutoSite ? { ...current, siteIds: [] } : current;
        }
        return hasSelection ? current : { ...seeded, siteIds: [] };
      }
      if (createScopeSeededRef.current && hasSelection) return current;
      createScopeSeededRef.current = true;
      return seeded;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, availableDealers.length, creatorDealerId, creatorOrgId, creatorDbId, assigneeRoleScope.key]);

  // Load edit user + groups
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const activeTenant = String(tenantId ?? "").trim();
      try {
        if (activeTenant) {
          const groupsBody = await rbacApiJson("/rbac/security-groups", { method: "GET" }, { tenantId: activeTenant });
          if (!cancelled) setGroups(Array.isArray(groupsBody?.groups) ? (groupsBody.groups as RbacGroup[]) : []);
        }
      } catch {
        if (!cancelled) setGroups([]);
      }

      if (mode !== "edit" || !editingId) return;
      setBusy(true);
      try {
        const staged = stagedUser?.id === editingId ? stagedUser : null;
        let record: RbacUser | null = staged
          ? { ...staged, id: editingId, name: String(staged.name ?? "").trim(), email: String(staged.email ?? "").trim(), status: staged.status || "active" }
          : null;
        try {
          const body = await rbacApiJson(
            `/rbac/users?userId=${encodeURIComponent(editingId)}`,
            { method: "GET" },
            { tenantId: activeTenant || undefined }
          );
          record = pickRbacUserFromResponse(body, editingId) ?? record;
        } catch {
          try {
            const list = await rbacApiJson("/rbac/users", { method: "GET" }, { tenantRequired: true, tenantId: activeTenant });
            record = pickRbacUserFromResponse(list, editingId) ?? record;
          } catch {
            /* keep staged */
          }
        }
        if (!record) {
          throw new Error("Unable to load this user. Open Users and try Edit again.");
        }
        if (cancelled) return;
        const assignedTenantIds = parseIdList(record.assignedTenantIds ?? record.assignedTenantId ?? tenantId ?? "");
        const fallbackTenantId = assignedTenantIds[0] ?? String(record.assignedTenantId ?? tenantId ?? "").trim();
        const dealerIds = uniqStrings(assignedTenantIds.map((tenant) => tenant.split(":")[0]));
        const orgIds = uniqStrings(assignedTenantIds.map((tenant) => tenant.split(":")[1]));
        const dbIds = uniqStrings(assignedTenantIds.map((tenant) => tenant.split(":")[2]));
        const siteIdsFromAssignments = Array.isArray(record.siteAssignments)
          ? uniqStrings(record.siteAssignments.map((row) => row.siteId))
          : [];
        const siteIds = siteIdsFromAssignments.length
          ? siteIdsFromAssignments
          : parseIdList(record.assignedSiteIds ?? record.assignedSiteId ?? "");
        setEditingUserTenantId(fallbackTenantId);
        setEditingUserRoleName(String(record.assignedRoleName ?? "").trim());
        setUserScopeDraft({ dealerIds, orgIds, dbIds, siteIds });
        setUserDraft({
          name: String(record.name ?? "").trim(),
          email: String(record.email ?? "").trim(),
          roleId: String(record.assignedRoleId ?? "").trim(),
          sendInvite: false
        });

        try {
          const assignBody = await rbacApiJson(
            `/rbac/assignments?userId=${encodeURIComponent(editingId)}`,
            { method: "GET" },
            { tenantRequired: true, tenantId: fallbackTenantId || activeTenant }
          );
          if (!cancelled) setGroupIds(Array.isArray(assignBody?.groupIds) ? assignBody.groupIds : []);
        } catch {
          if (!cancelled) setGroupIds([]);
        }
      } catch (e: any) {
        showToast(String(e?.message ?? e), "error");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, editingId, tenantId, stagedUser]);

  // Load role picker options
  useEffect(() => {
    const candidates = [editingUserTenantId, primarySelectedTenantId, String(tenantId ?? "").trim()]
      .map((v) => String(v ?? "").trim())
      .filter(Boolean);
    const tenantCandidates = Array.from(new Set(candidates));
    let cancelled = false;
    (async () => {
      let list: RbacRole[] = [];
      try {
        for (const candidate of tenantCandidates) {
          try {
            const body = await rbacApiJson("/rbac/roles", { method: "GET" }, { tenantId: candidate });
            const next = Array.isArray(body?.roles) ? (body.roles as RbacRole[]) : [];
            if (next.length) {
              list = next;
              break;
            }
          } catch {
            /* next */
          }
        }
        if (!list.length && roles.length) list = roles;
        const pickerOptions = buildUserRolePickerOptions(list.map(toRolePickerRow));
        if (!pickerOptions.length && editingId && userDraft.roleId) {
          const existing = roles.find((row) => row.id === userDraft.roleId);
          if (existing) pickerOptions.push(toRolePickerRow(existing));
          else pickerOptions.push({ id: userDraft.roleId, name: userDraft.roleId, status: "active", roleLevel: 100 });
        }
        if (cancelled) return;
        setRoles(list);
        setUserRoleOptions(pickerOptions);
        setUserDraft((c) => {
          if (c.roleId && pickerOptions.some((r) => r.id === c.roleId)) return c;
          const roleNameHint = String(editingUserRoleName ?? "").trim().toLowerCase();
          if (roleNameHint) {
            const byName = pickerOptions.find((row) => String(row.name ?? "").trim().toLowerCase() === roleNameHint);
            if (byName?.id) return { ...c, roleId: byName.id };
          }
          const preferred =
            pickerOptions.find((r) => /^basic user$/i.test(String(r.name ?? ""))) ??
            pickerOptions.find((r) => /^advanced user$/i.test(String(r.name ?? ""))) ??
            pickerOptions[0];
          return { ...c, roleId: preferred?.id ?? c.roleId ?? "" };
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingId, editingUserTenantId, editingUserRoleName, primarySelectedTenantId, tenantId, roles.length, userDraft.roleId]);

  const saveUser = async () => {
    if (!canEdit) {
      showToast("You do not have permission to edit users.", "error");
      return;
    }
    setBusy(true);
    setUserSaveError(null);
    let feedbackStarted = false;
    const isCreate = mode === "create";
    try {
      const payload: any = { name: userDraft.name, email: userDraft.email, sendInvite: userDraft.sendInvite };
      let selectedSiteAssignments = availableSites
        .filter((site) => selectedSiteIds.includes(site.id))
        .map((site) => ({ tenantId: site.tenantId, siteId: site.id, siteName: site.name }));
      let siteTenantIds = uniqStrings(selectedSiteAssignments.map((row) => row.tenantId));
      const dealerScopedTenantIds = allDbOptions
        .filter((db) => !selectedDealerIds.length || selectedDealerIds.includes(db.dealerId))
        .map((db) => db.tenantId);
      const orgScopedTenantIds = allDbOptions
        .filter((db) => selectedOrgIds.includes(db.orgId))
        .map((db) => db.tenantId);
      const activeTenantId = String(tenantId ?? "").trim();
      let assignmentTenantIds = collectAssignmentTenantIds({
        selectedTenantIds,
        siteTenantIds,
        dealerScopedTenantIds,
        orgScopedTenantIds,
        selectedDealerIds,
        selectedOrgIds,
        flags: assignmentPickerFlags,
        fallbackTenantId: activeTenantId
      });

      if (/^basic user$/i.test(assigneeRoleName) && selectedSiteAssignments.length === 0 && typeof window !== "undefined") {
        const activeSiteId = String(window.localStorage.getItem("vivi.activeSite") ?? "").trim();
        if (activeSiteId) {
          const match =
            availableSites.find((site) => site.id === activeSiteId && assignmentTenantIds.includes(site.tenantId)) ??
            availableSites.find((site) => site.id === activeSiteId) ??
            null;
          if (match) {
            selectedSiteAssignments = [...selectedSiteAssignments, { tenantId: match.tenantId, siteId: match.id, siteName: match.name }];
            siteTenantIds = uniqStrings(selectedSiteAssignments.map((row) => row.tenantId));
            if (!assignmentTenantIds.includes(match.tenantId)) {
              assignmentTenantIds = uniqStrings([...assignmentTenantIds, match.tenantId]);
            }
          }
        }
      }

      const failValidation = (message: string) => {
        setUserSaveError(message);
        showToast(message, "error");
      };
      const scopeError = assigneeRoleName
        ? validateAssignmentDraft(
            assigneeRoleName,
            assignmentTenantIds,
            selectedSiteAssignments.map((row) => row.siteId),
            selectedSiteAssignments
          )
        : null;
      if (scopeError) {
        failValidation(scopeError);
        return;
      }
      const editorScopeError = validateEditorAssignmentDraft(
        allowedTenants,
        assignmentTenantIds,
        selectedSiteAssignments.map((row) => ({ tenantId: row.tenantId, siteId: row.siteId })),
        principalKind === "admin" || Boolean((principal as any)?.isTenantAdmin) || hasOwnSupportRights
      );
      if (editorScopeError) {
        failValidation(editorScopeError);
        return;
      }

      const roleTenantCandidates = uniqStrings([
        ...assignmentTenantIds,
        ...dealerScopedTenantIds,
        ...siteTenantIds,
        editingUserTenantId,
        primarySelectedTenantId,
        tenantId
      ]);
      const pickedRole = userRoleOptions.find((row) => row.id === userDraft.roleId) ?? roles.find((row) => row.id === userDraft.roleId) ?? null;
      const resolvedRole = userDraft.roleId
        ? await resolveRoleIdAcrossTenants({
            roleId: userDraft.roleId,
            roleName: pickedRole?.name ?? assigneeRoleName ?? editingUserRoleName,
            tenantIds: roleTenantCandidates
          })
        : null;
      const saveTenantId = isCreate
        ? String(
            resolvedRole?.tenantId ?? assignmentTenantIds[0] ?? siteTenantIds[0] ?? primarySelectedTenantId ?? tenantId ?? ""
          ).trim()
        : resolveEditSaveTenantId({
            editingUserTenantId,
            activeTenantId: tenantId,
            resolvedRoleTenantId: resolvedRole?.tenantId,
            assignmentTenantIds,
            siteTenantIds
          });
      const resolvedRoleId = resolvedRole?.roleId ?? userDraft.roleId;
      const resolvedRoleName = String(pickedRole?.name ?? assigneeRoleName ?? editingUserRoleName ?? "").trim();
      const canSaveStandardRole = isStandardRoleName(resolvedRoleName) && Boolean(saveTenantId);
      const assignmentPayload = {
        tenantId: assignmentTenantIds[0] || saveTenantId,
        tenantIds: assignmentTenantIds.length ? assignmentTenantIds : saveTenantId ? [saveTenantId] : siteTenantIds,
        siteAssignments: selectedSiteAssignments
      };
      if (resolvedRoleName) payload.roleName = resolvedRoleName;

      let savedUserId = editingId;
      if (isCreate) {
        if (!assignmentTenantIds.length && !saveTenantId && !siteTenantIds.length) {
          failValidation("Select at least one Database or Site for the new user.");
          return;
        }
        if (!resolvedRoleId) {
          failValidation("Select a role for the new user.");
          return;
        }
        if (!resolvedRole && !canSaveStandardRole) {
          failValidation(`Role "${resolvedRoleName || userDraft.roleId}" is not available in the selected database scope.`);
          return;
        }
        payload.assignment = assignmentPayload;
        payload.roleId = resolvedRoleId;
        feedbackStarted = true;
        beginSaving("Creating user");
        const body = await rbacApiJson(
          "/rbac/users",
          {
            method: "POST",
            headers: { "content-type": "application/json", ...(saveTenantId ? { "x-tenant-id": saveTenantId } : {}) },
            body: JSON.stringify(payload)
          },
          { tenantId: saveTenantId || undefined }
        );
        savedUserId = String(body?.id ?? body?.user?.id ?? "").trim();
        endSavingDone(body?.reused ? "Existing user added to this database" : "User created");
        if (Boolean(body?.inviteEmailRequested) && Boolean(body?.inviteEmailSent)) {
          showToast("Set-password email sent.", "success");
        } else if (Boolean(body?.inviteEmailRequested) && String(body?.inviteEmailError ?? "").trim()) {
          showToast(`Account saved. Set-password email was not sent: ${String(body.inviteEmailError)}`, "info");
        }
      } else {
        if (!saveTenantId) {
          failValidation("Select a database context before saving this user.");
          return;
        }
        if (userDraft.roleId && !resolvedRole && !canSaveStandardRole) {
          failValidation(`Role "${resolvedRoleName || userDraft.roleId}" is not available in the selected database scope.`);
          return;
        }
        feedbackStarted = true;
        beginSaving("Updating user");
        await rbacApiJson(
          "/rbac/users",
          {
            method: "PUT",
            headers: { "content-type": "application/json", ...(saveTenantId ? { "x-tenant-id": saveTenantId } : {}) },
            body: JSON.stringify({
              id: editingId,
              ...payload,
              roleId: resolvedRoleId || undefined,
              roleName: resolvedRoleName || undefined,
              assignment: assignmentPayload
            })
          },
          { tenantId: saveTenantId, tenantRequired: true }
        );
        endSavingDone("User updated");
      }

      if (savedUserId && saveTenantId) {
        try {
          const existing = await rbacApiJson(
            `/rbac/assignments?userId=${encodeURIComponent(savedUserId)}`,
            { method: "GET" },
            { tenantRequired: true, tenantId: saveTenantId }
          );
          await rbacApiJson(
            "/rbac/assignments",
            {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                userId: savedUserId,
                tenantAccess: existing?.tenantAccess !== false,
                roleIds: uniqStrings([
                  resolvedRoleId,
                  ...(Array.isArray(existing?.roleIds) ? existing.roleIds : [])
                ]),
                groupIds
              })
            },
            { tenantRequired: true, tenantId: saveTenantId }
          );
        } catch {
          /* group membership best-effort */
        }
      }

      navigate(USERS_PATH);
    } catch (e: any) {
      const existingId = e instanceof RbacApiError ? e.existingId : "";
      if (existingId) {
        if (feedbackStarted) endSavingDone("Opening existing user");
        showToast("That email already has an account. Opening it.", "info");
        navigate(`${USERS_PATH}/edit/${encodeURIComponent(existingId)}`, { replace: true });
        return;
      }
      const message = String(e?.message ?? e);
      const displayMessage = isDuplicateUserEmailError(message) ? USER_EXISTS_POPUP : message;
      setUserSaveError(displayMessage);
      if (feedbackStarted) endSavingError(displayMessage);
      else showToast(displayMessage, "error");
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit && mode === "create") {
    return (
      <div className="page admin-page">
        <div className="admin-empty">You do not have permission to create users.</div>
      </div>
    );
  }

  return (
    <div className="page admin-page">
      <div className="admin-topbar">
        <div>
          <div className="admin-title">{mode === "create" ? "Create user" : "Edit user"}</div>
          <div className="admin-path">Control / User admin / Users / {mode === "create" ? "Create" : "Edit"}</div>
        </div>
        <div className="admin-actions">
          <button type="button" className="admin-btn ghost" onClick={() => navigate(USERS_PATH)} disabled={busy}>
            Back to users
          </button>
          <button type="button" className="admin-btn" onClick={() => void saveUser()} disabled={busy || !canEdit}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <section className="admin-panel admin-form-page">
        {userSaveError ? (
          <div className="admin-empty" style={{ color: "#b42318", marginBottom: 12 }} role="alert">
            {userSaveError}
          </div>
        ) : null}

        <div className="admin-form-grid">
          <label className="admin-modal-field">
            Full name
            <input value={userDraft.name} onChange={(e) => setUserDraft((c) => ({ ...c, name: e.target.value }))} />
          </label>
          <label className="admin-modal-field">
            Email
            <input value={userDraft.email} onChange={(e) => setUserDraft((c) => ({ ...c, email: e.target.value }))} />
          </label>
          <label className="admin-permission-item">
            <input type="checkbox" checked={userDraft.sendInvite} onChange={(e) => setUserDraft((c) => ({ ...c, sendInvite: e.target.checked }))} />
            <span>Send set-password email</span>
          </label>

          <label className="admin-modal-field">
            Assign role
            <select value={userDraft.roleId} onChange={(e) => setUserDraft((c) => ({ ...c, roleId: e.target.value }))}>
              {!userRoleOptions.length ? (
                <option value="">Loading roles…</option>
              ) : (
                <>
                  <option value="" disabled>
                    Select role
                  </option>
                  {sortRolesByPrivilege(userRoleOptions).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </>
              )}
            </select>
            <div className="admin-modal-sub">
              Prefer assigning actions via a <Link to={SECURITY_GROUPS_PATH}>security group</Link>. A direct role is still required so the user can sign in.
            </div>
          </label>

          <div className="admin-modal-field" style={{ gap: 8 }}>
            <span>Security groups</span>
            <div className="admin-modal-sub">Users inherit permissions from groups they belong to.</div>
            <div className="admin-permissions-list">
              {groups.length ? (
                groups.map((g) => (
                  <label key={g.id} className="admin-permission-item">
                    <input
                      type="checkbox"
                      checked={groupIds.includes(g.id)}
                      onChange={(e) =>
                        setGroupIds((current) => (e.target.checked ? [...current, g.id] : current.filter((id) => id !== g.id)))
                      }
                    />
                    <span>
                      {g.name}
                      {g.description ? ` — ${g.description}` : ""}
                    </span>
                  </label>
                ))
              ) : (
                <div className="admin-choice-empty">
                  No security groups yet. <Link to={`${SECURITY_GROUPS_PATH}/create`}>Create one</Link> first.
                </div>
              )}
            </div>
          </div>

          <div className="admin-modal-field" style={{ gap: 8 }}>
            <span>{mode === "edit" ? "Edit allocation" : "Assign scope"}</span>
            <div className="admin-modal-sub">{scopeHint}</div>
            <div className="admin-allocation-summary">Selected: {selectedAllocationLabel}</div>
            {showAssignDealer && (
              <AllocationChoices
                label="Dealer"
                options={availableDealers.map((dealer) => ({ id: dealer.id, name: dealer.name }))}
                values={selectedDealerIds}
                onSelect={chooseDealer}
              />
            )}
            {showAssignOrganisation && (
              <AllocationChoices
                label="Organisation"
                options={availableOrgs.map((org) => ({ id: org.id, name: org.name }))}
                values={selectedOrgIds}
                onSelect={chooseOrganisation}
                disabled={!hasOwnSupportRights && creatorLevel !== "dealer"}
              />
            )}
            {showAssignDatabase && (
              <AllocationChoices
                label="Database"
                options={dbOptionsForAssignee.map((db) => ({ id: db.id, name: db.name }))}
                values={selectedDbIdsForAssignee}
                onSelect={chooseDatabase}
                disabled={!hasOwnSupportRights && creatorLevel === "db"}
              />
            )}
            {showAssignSite && (
              <AllocationChoices
                label="Site"
                options={availableSites.map((site) => ({ id: site.id, name: site.name }))}
                values={selectedSiteIds}
                onSelect={chooseSite}
                singleSelect={siteSingleSelect}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
