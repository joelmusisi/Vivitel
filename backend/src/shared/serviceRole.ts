/**
 * VPS process role for Kubernetes service split.
 * Same image; each Deployment sets VIVI_SERVICE_ROLE.
 * Use "all" (default) for single-node / systemd installs.
 */
export type ViviServiceRole = "all" | "track" | "control" | "analyse" | "deliver";

export const resolveViviServiceRole = (raw = process.env.VIVI_SERVICE_ROLE): ViviServiceRole => {
  const value = String(raw ?? "all").trim().toLowerCase();
  if (value === "track" || value === "control" || value === "analyse" || value === "analyze" || value === "deliver") {
    return value === "analyze" ? "analyse" : value;
  }
  return "all";
};

export const createServiceRoleGate = (role: ViviServiceRole = resolveViviServiceRole()) => {
  const enabled = (...roles: Array<Exclude<ViviServiceRole, "all">>) => role === "all" || roles.includes(role as Exclude<ViviServiceRole, "all">);
  return {
    role,
    enabled,
    isTrack: () => enabled("track"),
    isControl: () => enabled("control"),
    isAnalyse: () => enabled("analyse"),
    isDeliver: () => enabled("deliver")
  };
};
