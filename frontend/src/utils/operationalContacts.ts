export const OPERATIONAL_CONTACTS_STORAGE_KEY = "vivi.reports.contacts";

export type OperationalContact = {
  id: string;
  firstName: string;
  lastName: string;
  employer: string;
  position: string;
  email: string;
  mobile: string;
};

export type AlertRecipientRef = {
  id: string;
  name: string;
  email?: string;
  mobile?: string;
};

export function contactDisplayName(contact: Pick<OperationalContact, "firstName" | "lastName" | "email">): string {
  const fullName = [contact.firstName, contact.lastName].map((part) => String(part ?? "").trim()).filter(Boolean).join(" ");
  return fullName || String(contact.email ?? "").trim() || "Contact";
}

export function recipientRefFromContact(contact: OperationalContact): AlertRecipientRef {
  return {
    id: contact.id,
    name: contactDisplayName(contact),
    email: String(contact.email ?? "").trim() || undefined,
    mobile: String(contact.mobile ?? "").trim() || undefined
  };
}

export function loadOperationalContacts(): OperationalContact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OPERATIONAL_CONTACTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        id: String(row?.id ?? "").trim(),
        firstName: String(row?.firstName ?? "").trim(),
        lastName: String(row?.lastName ?? "").trim(),
        employer: String(row?.employer ?? "").trim(),
        position: String(row?.position ?? "").trim(),
        email: String(row?.email ?? "").trim(),
        mobile: String(row?.mobile ?? "").trim()
      }))
      .filter((row) => row.id);
  } catch {
    return [];
  }
}

export function saveOperationalContacts(contacts: OperationalContact[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(OPERATIONAL_CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
}
