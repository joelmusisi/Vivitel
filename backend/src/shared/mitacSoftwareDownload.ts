export const MITAC_SOFTWARE_R2_KEY = "downloads/mitac-software/Vivitel_Mitac_Pack.zip";
export const MITAC_SOFTWARE_FILENAME = "Vivitel_Mitac_Pack.zip";
export const MITAC_SOFTWARE_CONTENT_TYPE = "application/zip";

export function resolveMitacSoftwareLocalPath(cwd = process.cwd()): string {
  const configured = String(process.env.MITAC_SOFTWARE_ZIP_PATH ?? "").trim();
  if (configured) return configured;
  const artifactsDir = String(process.env.DEVICE_ARTIFACTS_DIR ?? "").trim();
  if (artifactsDir) {
    return `${artifactsDir.replace(/[/\\]+$/, "")}/mitac-software/${MITAC_SOFTWARE_FILENAME}`;
  }
  return `${cwd.replace(/[/\\]+$/, "")}/device-artifacts/mitac-software/${MITAC_SOFTWARE_FILENAME}`;
}

export const mitacSoftwareDownloadHeaders = (): Record<string, string> => ({
  "content-type": MITAC_SOFTWARE_CONTENT_TYPE,
  "content-disposition": `attachment; filename="${MITAC_SOFTWARE_FILENAME}"`,
  "cache-control": "private, max-age=300"
});
