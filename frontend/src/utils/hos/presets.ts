import type { HosBreakRule, HosJurisdiction, HosLimitHours, HosRules } from "./types";

const withNear = (limits: Omit<HosLimitHours, "nearLimitFraction">): HosLimitHours => ({
  ...limits,
  nearLimitFraction: 0.15
});

/** Default client break ladders (2h→15m plus a longer threshold). */
export const DEFAULT_SHORT_BREAK_RULE: HosBreakRule = { afterDriveHours: 2, restMinutes: 15 };
export const DEFAULT_MID_BREAK_RULE: HosBreakRule = { afterDriveHours: 4, restMinutes: 30 };
export const DEFAULT_EU_LONG_BREAK_RULE: HosBreakRule = { afterDriveHours: 4.5, restMinutes: 45 };

export function resolveBreakRules(limits: Partial<HosLimitHours> | undefined): HosBreakRule[] {
  const raw = Array.isArray(limits?.breakRules) ? limits!.breakRules! : [];
  const cleaned = raw
    .map((row) => ({
      afterDriveHours: Number(row?.afterDriveHours) || 0,
      restMinutes: Number(row?.restMinutes) || 0
    }))
    .filter((row) => row.afterDriveHours > 0 && row.restMinutes > 0)
    .sort((a, b) => a.afterDriveHours - b.afterDriveHours);
  if (cleaned.length) return cleaned;

  const after = Number(limits?.breakAfterDriveHours) || 0;
  const rest = Number(limits?.breakMinutes) || 0;
  if (after > 0 && rest > 0) return [{ afterDriveHours: after, restMinutes: rest }];
  return [];
}

function withBreakRules(
  limits: Omit<HosLimitHours, "nearLimitFraction" | "breakRules"> & { breakRules: HosBreakRule[] }
): Omit<HosLimitHours, "nearLimitFraction"> {
  const rules = resolveBreakRules(limits);
  const primary = rules[rules.length - 1] ?? { afterDriveHours: 0, restMinutes: 0 };
  return {
    ...limits,
    breakRules: rules,
    breakAfterDriveHours: primary.afterDriveHours,
    breakMinutes: primary.restMinutes
  };
}

export const HOS_PRESETS: Record<HosJurisdiction, HosRules> = {
  eu_aetr: {
    jurisdiction: "eu_aetr",
    label: "EU / AETR (Reg. 561/2006)",
    limits: withNear(
      withBreakRules({
        dailyDriveHours: 9,
        extendedDailyDriveHours: 10,
        extendedDailyDriveUsesPerWeek: 2,
        breakAfterDriveHours: 4.5,
        breakMinutes: 45,
        breakRules: [DEFAULT_SHORT_BREAK_RULE, DEFAULT_EU_LONG_BREAK_RULE],
        dailyRestHours: 11,
        reducedDailyRestHours: 9,
        weeklyDriveHours: 56,
        biweeklyDriveHours: 90,
        monthlyDriveHours: 192
      })
    )
  },
  us_fmcsa: {
    jurisdiction: "us_fmcsa",
    label: "US FMCSA (property-carrying)",
    limits: withNear(
      withBreakRules({
        dailyDriveHours: 11,
        dutyWindowHours: 14,
        breakAfterDriveHours: 8,
        breakMinutes: 30,
        breakRules: [
          DEFAULT_SHORT_BREAK_RULE,
          DEFAULT_MID_BREAK_RULE,
          { afterDriveHours: 8, restMinutes: 30 }
        ],
        dailyRestHours: 10,
        weeklyDriveHours: 60,
        monthlyDriveHours: 260,
        cycleHours: 70,
        cycleDays: 8,
        restartOffDutyHours: 34
      })
    )
  },
  ca_federal: {
    jurisdiction: "ca_federal",
    label: "Canada federal",
    limits: withNear(
      withBreakRules({
        dailyDriveHours: 13,
        dailyOnDutyHours: 14,
        dutyWindowHours: 14,
        breakAfterDriveHours: 4,
        breakMinutes: 30,
        breakRules: [DEFAULT_SHORT_BREAK_RULE, DEFAULT_MID_BREAK_RULE],
        dailyRestHours: 8,
        weeklyDriveHours: 70,
        monthlyDriveHours: 280,
        cycleHours: 70,
        cycleDays: 7
      })
    )
  }
};

export const HOS_JURISDICTION_OPTIONS = (Object.keys(HOS_PRESETS) as HosJurisdiction[]).map((key) => ({
  value: key,
  label: HOS_PRESETS[key].label
}));

export function rulesFromPreset(jurisdiction: HosJurisdiction, overrides?: Partial<HosLimitHours>): HosRules {
  const base = HOS_PRESETS[jurisdiction] ?? HOS_PRESETS.eu_aetr;
  const mergedLimits = { ...base.limits, ...(overrides ?? {}) };
  const breakRules = resolveBreakRules(mergedLimits);
  const primary = breakRules[breakRules.length - 1] ?? {
    afterDriveHours: Number(mergedLimits.breakAfterDriveHours) || 0,
    restMinutes: Number(mergedLimits.breakMinutes) || 0
  };
  return {
    ...base,
    jurisdiction,
    limits: {
      ...mergedLimits,
      breakRules,
      breakAfterDriveHours: primary.afterDriveHours,
      breakMinutes: primary.restMinutes
    }
  };
}

export function normalizeHosRules(raw: unknown): HosRules {
  const row = (raw && typeof raw === "object" ? raw : {}) as Partial<HosRules> & {
    limits?: Partial<HosLimitHours> & { breakRules?: HosBreakRule[] };
  };
  const jurisdiction = (["eu_aetr", "us_fmcsa", "ca_federal"].includes(String(row.jurisdiction))
    ? row.jurisdiction
    : "eu_aetr") as HosJurisdiction;
  const limits: Partial<HosLimitHours> =
    row.limits && typeof row.limits === "object" ? { ...row.limits } : {};
  if (Array.isArray(limits.breakRules)) {
    limits.breakRules = limits.breakRules;
  }
  return rulesFromPreset(jurisdiction, limits);
}
