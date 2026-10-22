/**
 * Vivi organisation hierarchy categorisation (Mix-style patterns on Vivi data).
 *
 * Maps existing dealer → organisation → database → site IDs into a category tree
 * with optional site-family grouping when site labels look like "Family/Site"
 * (e.g. "CPP_TZ/Coating").
 */

export type ViviOrgCategory = {
  dealer: string;
  organisation: string;
  database: string;
  siteFamily: string;
  site: string;
  siteFull: string;
  breadcrumb: string;
};

export type ViviCategoryLevel =
  | "organisation"
  | "dealer"
  | "database"
  | "siteFamily"
  | "site";

export type ViviCategoryNode = {
  id: string;
  label: string;
  level: ViviCategoryLevel;
  /** Original hierarchy entity id when available. */
  entityId?: string;
  children: ViviCategoryNode[];
};

export type ViviHierarchySite = {
  id: string;
  name: string;
};

export type ViviHierarchyDatabase = {
  id: string;
  name: string;
  sites?: ViviHierarchySite[];
};

export type ViviHierarchyOrganisation = {
  id: string;
  name: string;
  databases?: ViviHierarchyDatabase[];
};

export type ViviHierarchyDealer = {
  id: string;
  name: string;
  organisations?: ViviHierarchyOrganisation[];
};

/**
 * Split site labels like "CPP_TZ/Coating".
 * Plain names keep the full string as site with empty family unless they match
 * a known family prefix pattern (CODE_XX rest).
 */
export function parseViviSiteLabel(raw: string): {
  siteFamily: string;
  site: string;
  siteFull: string;
} {
  const siteFull = String(raw || "").trim();
  if (!siteFull) return { siteFamily: "", site: "", siteFull: "" };

  const slash = siteFull.indexOf("/");
  if (slash > 0 && slash < siteFull.length - 1) {
    const siteFamily = siteFull.slice(0, slash).trim();
    const site = siteFull.slice(slash + 1).trim();
    if (siteFamily && site) return { siteFamily, site, siteFull };
  }

  const codeMatch = siteFull.match(/^((?:CPP|EACOP|XN)(?:[_\-][A-Za-z0-9]+)?)\b(.*)$/i);
  if (codeMatch) {
    const siteFamily = String(codeMatch[1] || "").trim();
    const rest = String(codeMatch[2] || "")
      .replace(/^[\s_\-\/]+/, "")
      .trim();
    if (siteFamily && rest) return { siteFamily, site: rest, siteFull };
    if (siteFamily) return { siteFamily, site: siteFamily, siteFull };
  }

  return { siteFamily: "", site: siteFull, siteFull };
}

export function buildViviOrgCategory(parts: {
  dealer?: string;
  organisation?: string;
  database?: string;
  siteFull?: string;
}): ViviOrgCategory {
  const dealer = String(parts.dealer ?? "").trim();
  const organisation = String(parts.organisation ?? "").trim();
  const database = String(parts.database ?? "").trim();
  const parsed = parseViviSiteLabel(String(parts.siteFull ?? "").trim());
  const siteLeaf =
    parsed.siteFamily && parsed.site && parsed.site !== parsed.siteFamily
      ? parsed.site
      : parsed.siteFamily
        ? ""
        : parsed.siteFull || parsed.site;

  const breadcrumb = [dealer, organisation, database, parsed.siteFamily, siteLeaf]
    .filter(Boolean)
    .join(" · ");

  return {
    dealer,
    organisation,
    database,
    siteFamily: parsed.siteFamily,
    site: parsed.site,
    siteFull: parsed.siteFull,
    breadcrumb
  };
}

function isDecommissioned(name: string): boolean {
  const s = String(name || "")
    .trim()
    .toLowerCase();
  return s.includes("decommission") || s === "xn_decommissioned" || s === "xn-decommissioned";
}

function sortNodes(nodes: ViviCategoryNode[]) {
  nodes.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  for (const n of nodes) sortNodes(n.children);
}

/**
 * Build category tree from Vivi hierarchy dealers.
 * UI labels swap dealer↔organisation; tree levels follow Mix-style nesting
 * under the operator-facing organisation root.
 */
export function buildViviCategoryTree(
  dealers: ViviHierarchyDealer[] | null | undefined
): ViviCategoryNode[] {
  if (!Array.isArray(dealers) || !dealers.length) return [];

  const roots: ViviCategoryNode[] = [];

  for (const dealer of dealers) {
    const dealerId = String(dealer?.id ?? "").trim();
    const dealerName = String(dealer?.name ?? "").trim();
    if (!dealerId && !dealerName) continue;

    // Operator-facing: dealer row is labelled "Organisation" in OrgRibbon.
    const orgRoot: ViviCategoryNode = {
      id: dealerId || `organisation:${dealerName}`,
      label: dealerName || "Organisation",
      level: "organisation",
      entityId: dealerId || undefined,
      children: []
    };

    for (const org of Array.isArray(dealer.organisations) ? dealer.organisations : []) {
      const orgId = String(org?.id ?? "").trim();
      const orgName = String(org?.name ?? "").trim();
      if (!orgId && !orgName) continue;

      // Operator-facing: organisation row is labelled "Dealer".
      const dealerNode: ViviCategoryNode = {
        id: orgId || `dealer:${orgName}`,
        label: orgName || "Dealer",
        level: "dealer",
        entityId: orgId || undefined,
        children: []
      };

      for (const db of Array.isArray(org.databases) ? org.databases : []) {
        const dbId = String(db?.id ?? "").trim();
        const dbName = String(db?.name ?? "").trim();
        if (!dbId && !dbName) continue;

        const databaseNode: ViviCategoryNode = {
          id: dbId || `database:${dbName}`,
          label: dbName || "Database",
          level: "database",
          entityId: dbId || undefined,
          children: []
        };

        const familyMap = new Map<string, ViviCategoryNode>();
        for (const site of Array.isArray(db.sites) ? db.sites : []) {
          const siteFull = String(site?.name ?? "").trim();
          if (!siteFull || isDecommissioned(siteFull)) continue;
          const siteId = String(site?.id ?? "").trim();
          const { siteFamily, site: siteLeaf } = parseViviSiteLabel(siteFull);

          const siteNode: ViviCategoryNode = {
            id: siteId || `site:${siteFull}`,
            label: siteLeaf || siteFull,
            level: "site",
            entityId: siteId || undefined,
            children: []
          };

          if (siteFamily) {
            let family = familyMap.get(siteFamily);
            if (!family) {
              family = {
                id: `family:${dbId || dbName}:${siteFamily}`,
                label: siteFamily,
                level: "siteFamily",
                children: []
              };
              familyMap.set(siteFamily, family);
              databaseNode.children.push(family);
            }
            if (
              siteNode.label.toLowerCase() === siteFamily.toLowerCase() &&
              !siteFull.includes("/")
            ) {
              family.children.push({ ...siteNode, label: siteFull });
            } else {
              family.children.push(siteNode);
            }
          } else {
            databaseNode.children.push(siteNode);
          }
        }

        sortNodes(databaseNode.children);
        dealerNode.children.push(databaseNode);
      }

      sortNodes(dealerNode.children);
      orgRoot.children.push(dealerNode);
    }

    sortNodes(orgRoot.children);
    roots.push(orgRoot);
  }

  sortNodes(roots);
  return roots;
}

/** Group flat sites under optional site-family headers for OrgRibbon browse. */
export function groupSitesByFamily<T extends { id: string; name: string }>(
  sites: T[]
): Array<{ family: string; sites: T[] }> {
  const familyOrder: string[] = [];
  const map = new Map<string, T[]>();
  const ungrouped: T[] = [];

  for (const site of sites) {
    const { siteFamily } = parseViviSiteLabel(site.name);
    if (siteFamily) {
      if (!map.has(siteFamily)) {
        map.set(siteFamily, []);
        familyOrder.push(siteFamily);
      }
      map.get(siteFamily)!.push(site);
    } else {
      ungrouped.push(site);
    }
  }

  const groups = familyOrder.map((family) => ({
    family,
    sites: map.get(family) ?? []
  }));
  if (ungrouped.length) {
    groups.push({ family: "", sites: ungrouped });
  }
  return groups;
}

/** Flatten category tree to filter/table rows. */
export function flattenViviCategoryTree(roots: ViviCategoryNode[] | null | undefined): Array<{
  organisation: string;
  dealer: string;
  database: string;
  siteFamily: string;
  site: string;
  siteFull: string;
  entityId?: string;
  breadcrumb: string;
}> {
  const out: Array<{
    organisation: string;
    dealer: string;
    database: string;
    siteFamily: string;
    site: string;
    siteFull: string;
    entityId?: string;
    breadcrumb: string;
  }> = [];
  if (!Array.isArray(roots)) return out;

  const walk = (
    node: ViviCategoryNode,
    ctx: {
      organisation: string;
      dealer: string;
      database: string;
      siteFamily: string;
    }
  ) => {
    const next = { ...ctx };
    if (node.level === "organisation") next.organisation = node.label;
    if (node.level === "dealer") next.dealer = node.label;
    if (node.level === "database") next.database = node.label;
    if (node.level === "siteFamily") next.siteFamily = node.label;

    if (node.level === "site") {
      const siteFull = next.siteFamily ? `${next.siteFamily}/${node.label}` : node.label;
      const breadcrumb = [
        next.organisation,
        next.dealer,
        next.database,
        next.siteFamily,
        node.label
      ]
        .filter(Boolean)
        .join(" · ");
      out.push({
        ...next,
        site: node.label,
        siteFull,
        entityId: node.entityId,
        breadcrumb
      });
    }

    for (const child of node.children) walk(child, next);
  };

  for (const root of roots) {
    walk(root, {
      organisation: "",
      dealer: "",
      database: "",
      siteFamily: ""
    });
  }
  return out;
}

const hierarchyNameToken = (value: unknown) => String(value ?? "").trim().toLowerCase();

export type HierarchyPlacement = {
  order: number;
  organisation: string;
  dealer: string;
  database: string;
  siteFamily: string;
  site: string;
  siteFull: string;
  breadcrumb: string;
};

export type HierarchyNamedRecord = {
  site?: unknown;
  organisation?: unknown;
  dealer?: unknown;
  database?: unknown;
  assetDescription?: unknown;
  name?: unknown;
  registration?: unknown;
};

const UNASSIGNED_ORDER = 1_000_000;

/** Walk the stored org tree in the operator's own order (not alphabetized). */
export function flattenHierarchyInTreeOrder(
  dealers: ViviHierarchyDealer[] | null | undefined
): HierarchyPlacement[] {
  const out: HierarchyPlacement[] = [];
  if (!Array.isArray(dealers)) return out;

  let order = 0;
  for (const dealer of dealers) {
    const organisation = String(dealer?.name ?? "").trim();
    const orgs = Array.isArray(dealer?.organisations) ? dealer.organisations : [];
    for (const org of orgs) {
      const dealerLabel = String(org?.name ?? "").trim();
      const databases = Array.isArray(org?.databases) ? org.databases : [];
      for (const db of databases) {
        const database = String(db?.name ?? "").trim();
        const sites = Array.isArray(db?.sites) ? db.sites : [];
        for (const site of sites) {
          const siteFull = String(site?.name ?? "").trim();
          if (!siteFull || isDecommissioned(siteFull)) continue;
          const parsed = parseViviSiteLabel(siteFull);
          const siteLeaf = parsed.site || siteFull;
          const breadcrumb = [organisation, dealerLabel, database, parsed.siteFamily, siteLeaf]
            .filter(Boolean)
            .join(" · ");
          out.push({
            order: order++,
            organisation,
            dealer: dealerLabel,
            database,
            siteFamily: parsed.siteFamily,
            site: siteLeaf,
            siteFull,
            breadcrumb
          });
        }
      }
    }
  }
  return out;
}

export function readStoredHierarchyDealers(): ViviHierarchyDealer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("vivi.org.dealers");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const placementMatchesHint = (
  placement: HierarchyPlacement,
  hints: { organisation?: string; dealer?: string; database?: string }
) => {
  const org = hierarchyNameToken(hints.organisation);
  const dealer = hierarchyNameToken(hints.dealer);
  const database = hierarchyNameToken(hints.database);
  if (org && hierarchyNameToken(placement.organisation) !== org && hierarchyNameToken(placement.dealer) !== org) {
    return false;
  }
  if (dealer && hierarchyNameToken(placement.dealer) !== dealer && hierarchyNameToken(placement.organisation) !== dealer) {
    return false;
  }
  if (database && hierarchyNameToken(placement.database) !== database) return false;
  return true;
};

export function createHierarchyArranger(dealers?: ViviHierarchyDealer[] | null) {
  const tree = Array.isArray(dealers) ? dealers : readStoredHierarchyDealers();
  const placements = flattenHierarchyInTreeOrder(tree);
  const bySite = new Map<string, HierarchyPlacement[]>();

  const remember = (key: string, placement: HierarchyPlacement) => {
    const token = hierarchyNameToken(key);
    if (!token) return;
    const list = bySite.get(token) ?? [];
    list.push(placement);
    bySite.set(token, list);
  };

  for (const placement of placements) {
    remember(placement.siteFull, placement);
    remember(placement.site, placement);
    if (placement.siteFamily) remember(`${placement.siteFamily}/${placement.site}`, placement);
  }

  const resolve = (row: HierarchyNamedRecord): HierarchyPlacement => {
    const siteFull = String(row.site ?? "").trim();
    const parsed = parseViviSiteLabel(siteFull);
    const hints = {
      organisation: String(row.organisation ?? "").trim(),
      dealer: String(row.dealer ?? "").trim(),
      database: String(row.database ?? "").trim()
    };
    const candidates = [
      ...(bySite.get(hierarchyNameToken(siteFull)) ?? []),
      ...(bySite.get(hierarchyNameToken(parsed.site)) ?? []),
      ...(bySite.get(hierarchyNameToken(`${parsed.siteFamily}/${parsed.site}`)) ?? [])
    ];
    const unique: HierarchyPlacement[] = [];
    const seen = new Set<number>();
    for (const candidate of candidates) {
      if (seen.has(candidate.order)) continue;
      seen.add(candidate.order);
      unique.push(candidate);
    }
    const matched = unique.find((item) => placementMatchesHint(item, hints)) ?? unique[0];
    if (matched) return matched;

    const site = parsed.site || siteFull || "Unassigned site";
    const organisation = hints.organisation;
    const dealer = hints.dealer;
    const database = hints.database;
    const breadcrumb = [organisation, dealer, database, parsed.siteFamily, site].filter(Boolean).join(" · ");
    return {
      order: UNASSIGNED_ORDER,
      organisation,
      dealer,
      database,
      siteFamily: parsed.siteFamily,
      site,
      siteFull: siteFull || site,
      breadcrumb
    };
  };

  const compare = (a: HierarchyNamedRecord, b: HierarchyNamedRecord) => {
    const left = resolve(a);
    const right = resolve(b);
    if (left.order !== right.order) return left.order - right.order;
    const siteCmp = left.site.localeCompare(right.site, undefined, { sensitivity: "base" });
    if (siteCmp) return siteCmp;
    const labelA = String(a.assetDescription ?? a.name ?? a.registration ?? "").trim();
    const labelB = String(b.assetDescription ?? b.name ?? b.registration ?? "").trim();
    return labelA.localeCompare(labelB, undefined, { sensitivity: "base" });
  };

  return {
    resolve,
    compare,
    sort<T extends HierarchyNamedRecord>(rows: T[]): T[] {
      return [...rows].sort(compare);
    },
    groupFor(row: HierarchyNamedRecord) {
      const placement = resolve(row);
      const title = placement.site || "Unassigned site";
      const path = [placement.organisation, placement.dealer, placement.database, placement.siteFamily]
        .filter((part) => part && hierarchyNameToken(part) !== hierarchyNameToken(title))
        .join(" · ");
      return {
        key: `${placement.order}:${placement.siteFull || placement.site}`,
        title,
        path
      };
    }
  };
}

export function sortRecordsByOrgHierarchy<T extends HierarchyNamedRecord>(
  rows: T[],
  dealers?: ViviHierarchyDealer[] | null
): T[] {
  return createHierarchyArranger(dealers).sort(rows);
}
