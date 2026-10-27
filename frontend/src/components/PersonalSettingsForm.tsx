import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchUserProfile,
  refreshAuthMe,
  updateUserProfile,
  type UserProfile
} from "../utils/api";
import {
  CONSUMPTION_OPTIONS,
  LANGUAGE_OPTIONS,
  REGIONAL_FORMATS,
  listCountries,
  listTimezones
} from "./personalSettingsOptions";
import "./PersonalSettings.css";

type PersonalSettingsFormProps = {
  variant?: "desktop" | "mobile";
  onBack?: () => void;
};

type SettingsTab = "details" | "regional";

type SettingsDraft = {
  firstName: string;
  lastName: string;
  employer: string;
  homeNumber: string;
  workNumber: string;
  mobile: string;
  country: string;
  language: string;
  timezone: string;
  format: string;
  measurementUnits: "metric" | "imperial";
  consumption: string;
};

const PHONE_HINT = "Include country code, e.g. +27 12 345 6789";

const EMPTY_DRAFT: SettingsDraft = {
  firstName: "",
  lastName: "",
  employer: "",
  homeNumber: "",
  workNumber: "",
  mobile: "",
  country: "",
  language: "en",
  timezone: "",
  format: "en-GB",
  measurementUnits: "metric",
  consumption: ""
};

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function draftFromProfile(profile: UserProfile): SettingsDraft {
  const split = splitName(profile.name || "");
  return {
    firstName: profile.firstName ?? split.firstName,
    lastName: profile.lastName ?? split.lastName,
    employer: profile.employer ?? "",
    homeNumber: profile.homeNumber ?? "",
    workNumber: profile.workNumber ?? "",
    mobile: profile.phone ?? "",
    country: profile.country ?? "",
    language: profile.language || "en",
    timezone: profile.timezone ?? "",
    format: profile.format || "en-GB",
    measurementUnits: profile.measurementUnits === "imperial" ? "imperial" : "metric",
    consumption: profile.consumption ?? ""
  };
}

function Field({
  label,
  required,
  hint,
  children,
  wide
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`psettings-field${wide ? " is-wide" : ""}`}>
      <span>
        {label}
        {required ? <em className="psettings-req">*</em> : null}
      </span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export default function PersonalSettingsForm({ variant = "desktop", onBack }: PersonalSettingsFormProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [draft, setDraft] = useState<SettingsDraft>(EMPTY_DRAFT);
  const [savedDraft, setSavedDraft] = useState<SettingsDraft>(EMPTY_DRAFT);
  const [tab, setTab] = useState<SettingsTab>("details");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [usernameOpen, setUsernameOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const countries = useMemo(() => listCountries(), []);
  const timezones = useMemo(() => listTimezones(), []);
  const activeFormat = REGIONAL_FORMATS.find((item) => item.id === draft.format) ?? REGIONAL_FORMATS[0];

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const row = await fetchUserProfile();
      if (!row) {
        setError("Unable to load your profile.");
        return;
      }
      const next = draftFromProfile(row);
      setProfile(row);
      setDraft(next);
      setSavedDraft(next);
    } catch {
      setError("Unable to load your profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchDraft = (patch: Partial<SettingsDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setMessage("");
  };

  const cancel = () => {
    setDraft(savedDraft);
    setError("");
    setMessage("");
  };

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(savedDraft),
    [draft, savedDraft]
  );

  const save = async () => {
    setError("");
    setMessage("");
    if (!draft.firstName.trim()) {
      setTab("details");
      setError("First name is required.");
      return;
    }

    setSaving(true);
    try {
      const result = await updateUserProfile({
        name: [draft.firstName.trim(), draft.lastName.trim()].filter(Boolean).join(" "),
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        employer: draft.employer.trim(),
        homeNumber: draft.homeNumber.trim(),
        workNumber: draft.workNumber.trim(),
        phone: draft.mobile.trim(),
        country: draft.country,
        language: draft.language || "en",
        timezone: draft.timezone,
        format: draft.format || "en-GB",
        measurementUnits: draft.measurementUnits,
        consumption: draft.consumption
      });
      if (!result.ok) {
        setError(result.error ?? "Unable to save settings.");
        return;
      }
      const nextProfile = result.profile ?? profile;
      if (nextProfile) {
        const next = draftFromProfile({
          ...nextProfile,
          firstName: nextProfile.firstName ?? draft.firstName.trim(),
          lastName: nextProfile.lastName ?? draft.lastName.trim(),
          employer: nextProfile.employer ?? draft.employer.trim(),
          homeNumber: nextProfile.homeNumber ?? draft.homeNumber.trim(),
          workNumber: nextProfile.workNumber ?? draft.workNumber.trim(),
          phone: nextProfile.phone ?? draft.mobile.trim(),
          country: nextProfile.country ?? draft.country,
          language: nextProfile.language ?? draft.language,
          timezone: nextProfile.timezone ?? draft.timezone,
          format: nextProfile.format ?? draft.format,
          measurementUnits: nextProfile.measurementUnits ?? draft.measurementUnits,
          consumption: nextProfile.consumption ?? draft.consumption
        });
        setProfile(nextProfile);
        setDraft(next);
        setSavedDraft(next);
      } else {
        const next = { ...draft };
        setSavedDraft(next);
      }
      await refreshAuthMe();
      setMessage("Settings saved.");
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    setPasswordError("");
    if (!newPassword || newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    setPasswordSaving(true);
    try {
      const result = await updateUserProfile({
        currentPassword,
        newPassword
      });
      if (!result.ok) {
        setPasswordError(result.error ?? "Unable to change password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordOpen(false);
      setMessage("Password updated.");
      setError("");
    } finally {
      setPasswordSaving(false);
    }
  };

  const rootClass = variant === "mobile" ? "psettings psettings--mobile" : "psettings page";
  const countryKnown = !draft.country || countries.some((item) => item.id === draft.country);
  const timezoneKnown = !draft.timezone || timezones.some((item) => item.id === draft.timezone);

  return (
    <div className={rootClass}>
      {variant === "mobile" && onBack && (
        <button type="button" className="psettings-back" onClick={onBack}>
          ← Profile
        </button>
      )}

      <form
        className="psettings-card"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <header className="psettings-toolbar">
          <h1>Personal settings</h1>
          <div className="psettings-toolbar-actions">
            <button type="button" className="psettings-btn" onClick={cancel} disabled={loading || saving || !dirty}>
              Cancel
            </button>
            <button type="submit" className="psettings-btn psettings-btn--save" disabled={loading || saving || !dirty}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </header>

        {loading && <p className="psettings-note">Loading profile…</p>}
        {error && <div className="psettings-error">{error}</div>}
        {message && <div className="psettings-success">{message}</div>}

        {!loading && profile && (
          <div className="psettings-body">
            <nav className="psettings-nav" aria-label="Personal settings sections">
              <p className="psettings-nav-title">Personal settings</p>
              <button
                type="button"
                className={tab === "details" ? "is-active" : ""}
                onClick={() => setTab("details")}
              >
                Personal details
              </button>
              <button
                type="button"
                className={tab === "regional" ? "is-active" : ""}
                onClick={() => setTab("regional")}
              >
                Regional settings
              </button>
            </nav>

            <div className="psettings-main">
              {tab === "details" ? (
                <>
                  <h2>Personal details</h2>
                  <div className="psettings-grid">
                    <Field label="Username" required wide>
                      <input type="text" value={profile.email} readOnly disabled />
                    </Field>
                    <Field label="First Name" required>
                      <input
                        type="text"
                        value={draft.firstName}
                        onChange={(event) => patchDraft({ firstName: event.target.value })}
                        autoComplete="given-name"
                      />
                    </Field>
                    <Field label="Last Name">
                      <input
                        type="text"
                        value={draft.lastName}
                        onChange={(event) => patchDraft({ lastName: event.target.value })}
                        autoComplete="family-name"
                      />
                    </Field>
                    <Field label="Employer">
                      <input
                        type="text"
                        value={draft.employer}
                        onChange={(event) => patchDraft({ employer: event.target.value })}
                        autoComplete="organization"
                      />
                    </Field>
                    <div className="psettings-grid-gap" aria-hidden="true" />
                    <Field label="Home number" hint={PHONE_HINT}>
                      <input
                        type="tel"
                        value={draft.homeNumber}
                        onChange={(event) => patchDraft({ homeNumber: event.target.value })}
                        autoComplete="tel"
                      />
                    </Field>
                    <Field label="Work number" hint={PHONE_HINT}>
                      <input
                        type="tel"
                        value={draft.workNumber}
                        onChange={(event) => patchDraft({ workNumber: event.target.value })}
                        autoComplete="tel"
                      />
                    </Field>
                    <Field label="Mobile number" hint={PHONE_HINT}>
                      <input
                        type="tel"
                        value={draft.mobile}
                        onChange={(event) => patchDraft({ mobile: event.target.value })}
                        autoComplete="tel"
                      />
                    </Field>
                  </div>
                  <div className="psettings-inline-actions">
                    <button type="button" className="psettings-btn" onClick={() => setUsernameOpen(true)}>
                      Change username
                    </button>
                    <button
                      type="button"
                      className="psettings-btn"
                      onClick={() => {
                        setPasswordError("");
                        setCurrentPassword("");
                        setNewPassword("");
                        setConfirmPassword("");
                        setPasswordOpen(true);
                      }}
                    >
                      Change password
                    </button>
                    <button type="button" className="psettings-btn" onClick={cancel} disabled={loading || saving || !dirty}>
                      Cancel
                    </button>
                    <button type="submit" className="psettings-btn psettings-btn--save" disabled={loading || saving || !dirty}>
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2>Regional Settings</h2>
                  <div className="psettings-grid">
                    <Field label="Country">
                      <select
                        value={draft.country}
                        onChange={(event) => patchDraft({ country: event.target.value })}
                      >
                        <option value="">Select country</option>
                        {!countryKnown && <option value={draft.country}>{draft.country}</option>}
                        {countries.map((country) => (
                          <option key={country.id} value={country.id}>
                            {country.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Select language">
                      <select
                        value={draft.language}
                        onChange={(event) => patchDraft({ language: event.target.value })}
                      >
                        {LANGUAGE_OPTIONS.map((language) => (
                          <option key={language.id} value={language.id}>
                            {language.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Timezone">
                      <select
                        value={draft.timezone}
                        onChange={(event) => patchDraft({ timezone: event.target.value })}
                      >
                        <option value="">Select timezone</option>
                        {!timezoneKnown && <option value={draft.timezone}>{draft.timezone}</option>}
                        {timezones.map((zone) => (
                          <option key={zone.id} value={zone.id}>
                            {zone.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <h2>Display settings</h2>
                  <div className="psettings-grid">
                    <Field label="Format">
                      <select
                        value={draft.format}
                        onChange={(event) => patchDraft({ format: event.target.value })}
                      >
                        {REGIONAL_FORMATS.map((format) => (
                          <option key={format.id} value={format.id}>
                            {format.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="psettings-format-preview">
                      <p>Date format: {activeFormat.date}</p>
                      <p>Time format: {activeFormat.time}</p>
                      <p>Number format: {activeFormat.number}</p>
                    </div>
                  </div>

                  <h2>Units of measure</h2>
                  <div className="psettings-grid">
                    <Field label="Measurement units">
                      <select
                        value={draft.measurementUnits}
                        onChange={(event) =>
                          patchDraft({
                            measurementUnits: event.target.value === "imperial" ? "imperial" : "metric"
                          })
                        }
                      >
                        <option value="metric">Metric</option>
                        <option value="imperial">Imperial</option>
                      </select>
                    </Field>
                    <Field label="Consumption">
                      <select
                        value={draft.consumption}
                        onChange={(event) => patchDraft({ consumption: event.target.value })}
                      >
                        <option value="">Distance units/Volume units (e.g. km/l or mpg)</option>
                        {draft.consumption &&
                          !CONSUMPTION_OPTIONS.some((item) => item.id === draft.consumption) && (
                            <option value={draft.consumption}>{draft.consumption}</option>
                          )}
                        {CONSUMPTION_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="psettings-inline-actions">
                    <button type="button" className="psettings-btn" onClick={cancel} disabled={loading || saving || !dirty}>
                      Cancel
                    </button>
                    <button type="submit" className="psettings-btn psettings-btn--save" disabled={loading || saving || !dirty}>
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </form>

      {usernameOpen && (
        <div className="psettings-modal" role="presentation" onClick={() => setUsernameOpen(false)}>
          <div
            className="psettings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="psettings-username-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="psettings-username-title">Change username</h3>
            <p>
              Your username is your sign-in email
              {profile?.email ? ` (${profile.email})` : ""} and cannot be changed here.
            </p>
            <div className="psettings-dialog-actions">
              <button type="button" className="psettings-btn psettings-btn--save" onClick={() => setUsernameOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordOpen && (
        <div className="psettings-modal" role="presentation" onClick={() => setPasswordOpen(false)}>
          <form
            className="psettings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="psettings-password-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void savePassword();
            }}
          >
            <h3 id="psettings-password-title">Change password</h3>
            {passwordError && <div className="psettings-error">{passwordError}</div>}
            <Field label="Current password" required>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password" required>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm new password" required>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <div className="psettings-dialog-actions">
              <button type="button" className="psettings-btn" onClick={() => setPasswordOpen(false)} disabled={passwordSaving}>
                Cancel
              </button>
              <button type="submit" className="psettings-btn psettings-btn--save" disabled={passwordSaving}>
                {passwordSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
