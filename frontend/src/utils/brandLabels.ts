/** Display name for the VIVI platform in user-facing copy. */
export const BRAND_NAME = "VIVI";

/**
 * Rewrites legacy vendor names in UI strings only.
 * Does not alter API paths, identifiers, or domains (e.g. mixtel.com,
 * traccar.vivitelematics.ca, /api/traccar/...).
 */
export function toBrandDisplay(text: string): string {
  if (!text) return text;

  const preserved: string[] = [];
  const stash = (match: string) => {
    const token = `\uE000${preserved.length}\uE001`;
    preserved.push(match);
    return token;
  };

  // Keep infrastructure hostnames / API segments that legitimately contain "traccar".
  let out = text
    .replace(/https?:\/\/[^\s]+/gi, stash)
    .replace(/\b[\w-]*traccar[\w.-]*/gi, (match) => {
      if (/[./-]/.test(match)) return stash(match);
      return match;
    });

  out = out
    .replace(/Traccar/g, BRAND_NAME)
    .replace(/traccar/g, "vivi")
    .replace(/\bMiXTelematics\b/g, `${BRAND_NAME} Telematics`)
    .replace(/\bMiX Fleet\b/g, `${BRAND_NAME} Fleet`)
    .replace(/\bMiX GPS\b/g, `${BRAND_NAME} GPS`)
    .replace(/\bMiXVision\b/g, `${BRAND_NAME}Vision`)
    .replace(/\bMiX(?=\d)/g, BRAND_NAME)
    .replace(/\bMiX\b/g, BRAND_NAME)
    .replace(/\bMix\b/g, BRAND_NAME);

  preserved.forEach((value, index) => {
    out = out.replace(`\uE000${index}\uE001`, value);
  });
  return out;
}
