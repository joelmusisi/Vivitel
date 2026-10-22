export type RbacUser = {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;
  lastLoginAt?: string;
  assignedTenantId?: string;
  assignedTenantIds?: string[] | string;
  assignedSiteId?: string;
  assignedSiteName?: string;
  assignedSiteIds?: string[] | string;
  siteAssignments?: Array<{ tenantId: string; siteId: string; siteName?: string }>;
  assignedRoleId?: string;
  assignedRoleLevel?: number;
  assignedRoleName?: string;
  demo?: {
    active?: boolean;
    expired?: boolean;
    activated?: boolean;
    daysRemaining?: number;
    hierarchy?: {
      organisation?: string;
      dealer?: string;
      database?: string;
      site?: string;
    } | null;
  } | null;
};

export type RbacRole = {
  id: string;
  name: string;
  description?: string;
  status: string;
  roleLevel?: number;
  isSystem?: number | boolean;
  standardRoleKey?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type RbacGroup = {
  id: string;
  name: string;
  description?: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};

export type RolePermRow = {
  roleId: string;
  pagePath: string;
  canView: number;
  canEdit: number;
  canDelete: number;
};

export type Site = { id: string; name: string; assets?: string[] };
export type Database = { id: string; name: string; sites: Site[] };
export type Organisation = { id: string; name: string; databases: Database[] };
export type Dealer = { id: string; name: string; organisations: Organisation[] };
export type ChoiceOption = { id: string; name: string };
export type OrganisationOption = ChoiceOption & { dealerId: string };
export type DatabaseOption = ChoiceOption & { dealerId: string; orgId: string; tenantId: string };
export type SiteOption = ChoiceOption & { dealerId: string; orgId: string; dbId: string; tenantId: string };
export type UserScopeDraft = { dealerIds: string[]; orgIds: string[]; dbIds: string[]; siteIds: string[] };

export type PageDef = { path: string; label: string; area: "Track" | "Control" | "Analyze" | "Deliver" };
export type Action = "view" | "edit" | "delete";
