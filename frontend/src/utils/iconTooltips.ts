const isIconOnly = (el: HTMLElement) =>
  !!el.querySelector("svg, img, i") && !(el.textContent || "").trim();

const apply = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return;
  const el = target.closest<HTMLElement>("button, [role='button'], a");
  if (!el || el.hasAttribute("data-tooltip") || !isIconOnly(el)) return;
  const label = (el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
  if (!label) return;
  el.setAttribute("data-tooltip", label);
  el.removeAttribute("title");
};

/** Gives every icon-only control a hover tooltip using its aria-label/title. */
export function installIconTooltips(): () => void {
  const handler = (e: Event) => apply(e.target);
  document.addEventListener("mouseover", handler, true);
  document.addEventListener("focusin", handler, true);
  return () => {
    document.removeEventListener("mouseover", handler, true);
    document.removeEventListener("focusin", handler, true);
  };
}
