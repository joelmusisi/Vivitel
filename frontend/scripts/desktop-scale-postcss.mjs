/**
 * Tablets and narrow desktop windows render the 1440px desktop layout inside a zoomed
 * `.desktop-scale-canvas` (see src/components/DesktopScaleRoot.tsx), and <html> gets
 * `.vivi-desktop-scaled`. Two CSS features still see the real, narrower screen there:
 *
 * 1. `@media (max-width: N)` with N < 1440 fired inside the 1440 canvas, switching pages to
 *    stacked phone layouts (iPad Live Tracking, Assets, ...). Rules in those blocks now only
 *    apply when the page is not scaled. `:where()` keeps their specificity unchanged, so phones
 *    (never scaled) behave exactly as before.
 * 2. `vh`/`vw` resolve against the real viewport, so a 100vh page filled only ~half a portrait
 *    iPad. They are divided by `--vivi-desktop-scale` (1 on phones and wide desktops).
 */
const DESIGN_WIDTH_PX = 1440;
const NOT_SCALED = ":where(:not(.vivi-desktop-scaled))";
const VIEWPORT_UNIT = /(-?\d*\.?\d+)(d|s|l)?(vh|vw)\b/g;
const HAS_VIEWPORT_UNIT = /\d(d|s|l)?(vh|vw)\b/;
const OUTSIDE_CANVAS = /^\s*(html|body|:root|#root)\s*(,|$)|desktop-scale-viewport|trip-tooltip-rich/;

const isNarrowWidthQuery = (params) => {
  if (/min-width/i.test(params)) return false;
  const match = /max-width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(params);
  return Boolean(match) && Number(match[1]) < DESIGN_WIDTH_PX;
};

const scopeSelector = (selector) => {
  const trimmed = selector.trim();
  if (/^:root\b/.test(trimmed)) return trimmed.replace(/^:root/, `:root${NOT_SCALED}`);
  if (/^html(?![\w-])/.test(trimmed)) return trimmed.replace(/^html/, `html${NOT_SCALED}`);
  return `html${NOT_SCALED} ${trimmed}`;
};

const insideKeyframes = (rule) => {
  for (let node = rule.parent; node; node = node.parent) {
    if (node.type === "atrule" && /keyframes$/i.test(node.name)) return true;
  }
  return false;
};

export default function desktopScaleCss() {
  return {
    postcssPlugin: "vivi-desktop-scale-css",
    Once(root, { result }) {
      const file = String(root.source?.input?.file ?? result.opts.from ?? "");
      if (/node_modules/.test(file)) return;

      root.walkAtRules("media", (atRule) => {
        if (!isNarrowWidthQuery(atRule.params)) return;
        atRule.walkRules((rule) => {
          if (insideKeyframes(rule) || rule.selector.includes(".vivi-desktop-scaled")) return;
          rule.selectors = rule.selectors.map(scopeSelector);
        });
      });

      root.walkDecls((decl) => {
        if (!HAS_VIEWPORT_UNIT.test(decl.value) || decl.value.includes("--vivi-desktop-scale")) return;
        // Wrappers outside the zoomed canvas measure the real viewport; leave them alone.
        if (decl.parent?.type === "rule" && OUTSIDE_CANVAS.test(decl.parent.selector)) return;
        decl.value = decl.value.replace(
          VIEWPORT_UNIT,
          (unit) => `calc(${unit} / var(--vivi-desktop-scale, 1))`
        );
      });
    }
  };
}
desktopScaleCss.postcss = true;
