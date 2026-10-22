import { buildApiUrl, getApiKey, getHierarchy, getStoredApiKey, getTenantId, setStoredApiKey } from "./api";
import { loadScopedFromApi, saveScopedToApi } from "./scopeStorage";
import { readActiveSiteName } from "./tenantContext";
import type { AlertRecipientRef } from "./operationalContacts";

const SITE_CONTACTS_BASE = "device-alerts:site-contacts";

export type SiteLocalContact = {
  id: string;
  site: string;
  firstName: string;
  lastName: string;
  employer: string;
  position: string;
  email: string;
  mobile: string;
};

export type SiteRecipientOption = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  employer: string;
  position: string;
  email: string;
  mobile: string;
  source: "user" | "contact";
  hasAccount: boolean;
  subtitle?: string;
};

type RbacUserRow = {
  id?: string;
  name?: string;
  email?: string;
  status?: string;
  assignedSiteId?: string;
  assignedSiteName?: string;
  assignedSiteIds?: string | string[];
};

const normalizeSite = (value: unknown) => String(value ?? "").trim().toLowerCase();

const parseList = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  }
  return String(value ?? "")
    .split(/[|,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export function contactDisplayNameFromParts(firstName: string, lastName: string, email: string) {
  const fullName = [firstName, lastName].map((part) => String(part ?? "").trim()).filter(Boolean).join(" ");
  return fullName || String(email ?? "").trim() || "Recipient";
}

export function splitPersonName(fullName: string) {
  const parts = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function userHasAccessToSite(user: RbacUserRow, siteKeys: Set<string>): boolean {
  if (!siteKeys.size) return false;

  const siteIds = parseList(user.assignedSiteIds ?? user.assignedSiteId).map(normalizeSite);
  const assignedSiteName = normalizeSite(user.assignedSiteName);
  const candidates = new Set([...siteIds, assignedSiteName].filter(Boolean));

  for (const candidate of candidates) {
    if (siteKeys.has(candidate)) return true;
    for (const key of siteKeys) {
      if (candidate === key || candidate.includes(key) || key.includes(candidate)) return true;
    }
  }

  return false;
}

async function resolveActiveSiteKeys(siteName: string): Promise<Set<string>> {
  const keys = new Set<string>();
  const normalized = normalizeSite(siteName);
  if (normalized) keys.add(normalized);

  try {
    const hierarchy = await getHierarchy();
    for (const dealer of hierarchy.dealers ?? []) {
      for (const org of dealer.organisations ?? []) {
        for (const database of org.databases ?? []) {
          for (const site of database.sites ?? []) {
            const siteId = normalizeSite(site.id);
            const siteLabel = normalizeSite(site.name);
            if (siteLabel === normalized || siteId === normalized) {
              if (siteId) keys.add(siteId);
              if (siteLabel) keys.add(siteLabel);
            }
          }
        }
      }
    }
  } catch {
    // Keep name-only matching when hierarchy is unavailable.
  }

  return keys;
}

async function fetchRbacUsersForTenant(): Promise<RbacUserRow[]> {
  const initialApiKey = getApiKey();
  const hadStoredToken = Boolean(getStoredApiKey());
  const tenantId = getTenantId();
  if (!initialApiKey || !tenantId) return [];

  const doFetch = async (apiKey: string) =>
    fetch(buildApiUrl("/rbac/users"), {
      method: "GET",
      headers: {
        "x-tenant-id": tenantId,
        "x-api-key": apiKey
      }
    });

  let response = await doFetch(initialApiKey);
  if ((response.status === 401 || response.status === 403) && hadStoredToken) {
    setStoredApiKey("");
    const fallbackApiKey = getApiKey();
    if (fallbackApiKey && fallbackApiKey !== initialApiKey) {
      response = await doFetch(fallbackApiKey);
    }
  }

  if (!response.ok) return [];

  try {
    const body = (await response.json()) as { users?: RbacUserRow[] };
    return Array.isArray(body.users) ? body.users : [];
  } catch {
    return [];
  }
}

export async function loadSiteLocalContacts(site?: string): Promise<SiteLocalContact[]> {
  const activeSite = String(site ?? readActiveSiteName()).trim();
  if (!activeSite) return [];

  try {
    const stored = await loadScopedFromApi<{ items?: SiteLocalContact[] }>(SITE_CONTACTS_BASE, activeSite);
    if (!stored?.items || !Array.isArray(stored.items)) return [];

    return stored.items
      .map((row) => ({
        id: String(row?.id ?? "").trim(),
        site: String(row?.site ?? activeSite).trim(),
        firstName: String(row?.firstName ?? "").trim(),
        lastName: String(row?.lastName ?? "").trim(),
        employer: String(row?.employer ?? "").trim(),
        position: String(row?.position ?? "").trim(),
        email: String(row?.email ?? "").trim(),
        mobile: String(row?.mobile ?? "").trim()
      }))
      .filter((row) => row.id && normalizeSite(row.site) === normalizeSite(activeSite));
  } catch {
    return [];
  }
}

export async function saveSiteLocalContacts(contacts: SiteLocalContact[], site?: string): Promise<void> {
  const activeSite = String(site ?? readActiveSiteName()).trim();
  if (!activeSite) return;
  await saveScopedToApi(
    SITE_CONTACTS_BASE,
    {
      items: contacts.filter((row) => normalizeSite(row.site) === normalizeSite(activeSite))
    },
    activeSite
  );
}

export async function loadSiteRecipientOptions(site?: string): Promise<SiteRecipientOption[]> {
  const activeSite = String(site ?? readActiveSiteName()).trim();
  if (!activeSite) return [];

  const [users, localContacts, siteKeys] = await Promise.all([
    fetchRbacUsersForTenant(),
    loadSiteLocalContacts(activeSite),
    resolveActiveSiteKeys(activeSite)
  ]);

  const options = new Map<string, SiteRecipientOption>();

  for (const user of users) {
    const id = String(user.id ?? "").trim();
    const email = String(user.email ?? "").trim();
    const name = String(user.name ?? "").trim();
    const status = String(user.status ?? "active").trim().toLowerCase();
    if (!id || !email || status !== "active") continue;
    if (!userHasAccessToSite(user, siteKeys)) continue;

    const optionId = `user:${id}`;
    const { firstName, lastName } = splitPersonName(name || email);
    options.set(optionId, {
      id: optionId,
      name: name || email,
      firstName,
      lastName,
      employer: "",
      position: "",
      email,
      mobile: "",
      source: "user",
      hasAccount: true,
      subtitle: "User account"
    });
  }

  for (const contact of localContacts) {
    const optionId = `contact:${contact.id}`;
    options.set(optionId, {
      id: optionId,
      name: contactDisplayNameFromParts(contact.firstName, contact.lastName, contact.email),
      firstName: contact.firstName,
      lastName: contact.lastName,
      employer: contact.employer,
      position: contact.position,
      email: contact.email,
      mobile: contact.mobile,
      source: "contact",
      hasAccount: false,
      subtitle: contact.position || contact.employer || "Site contact"
    });
  }

  return Array.from(options.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function recipientRefFromSiteOption(option: SiteRecipientOption): AlertRecipientRef {
  return {
    id: option.id,
    name: option.name,
    email: option.email || undefined,
    mobile: option.mobile || undefined
  };
}

export async function addSiteLocalContact(input: {
  firstName: string;
  lastName?: string;
  employer?: string;
  position?: string;
  email: string;
  mobile?: string;
  site?: string;
}): Promise<SiteLocalContact> {
  const activeSite = String(input.site ?? readActiveSiteName()).trim();
  const contact: SiteLocalContact = {
    id: `contact-${Date.now()}`,
    site: activeSite,
    firstName: String(input.firstName ?? "").trim(),
    lastName: String(input.lastName ?? "").trim(),
    employer: String(input.employer ?? "").trim(),
    position: String(input.position ?? "").trim(),
    email: String(input.email ?? "").trim(),
    mobile: String(input.mobile ?? "").trim()
  };

  const existing = await loadSiteLocalContacts(activeSite);
  const next = [contact, ...existing.filter((row) => row.id !== contact.id)];
  await saveSiteLocalContacts(next, activeSite);
  return contact;
}
