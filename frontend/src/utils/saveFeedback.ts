import { sanitizeFeedbackLabel } from "./uiMessage";

export const REQUIRED_MISSING_CLASS = "vivi-required-missing";

const OVERLAY_ID = "vivi-save-feedback";
const SAVED_MS = 2000;

let hideTimer: number | null = null;

function clearHideTimer() {
  if (hideTimer != null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function ensureOverlay(): HTMLElement {
  let root = document.getElementById(OVERLAY_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = OVERLAY_ID;
    root.className = "vivi-save-feedback";
    root.setAttribute("aria-live", "polite");
    document.body.appendChild(root);
  }
  return root;
}

function hideOverlay() {
  const root = document.getElementById(OVERLAY_ID);
  if (!root) return;
  root.classList.remove("is-visible", "is-saving", "is-saved");
  root.removeAttribute("aria-busy");
  root.innerHTML = "";
}

function escapeFeedbackLabel(label: string, fallback: string) {
  return sanitizeFeedbackLabel(label, fallback)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Top-center leaflet while a create/edit save is in flight. */
export function beginSaving(label = "Saving") {
  if (typeof window === "undefined") return;
  clearHideTimer();
  const root = ensureOverlay();
  root.classList.remove("is-saved");
  root.classList.add("is-visible", "is-saving");
  root.innerHTML = `
    <div class="vivi-save-feedback-card is-saving" role="status">
      <div class="vivi-save-feedback-spinner" aria-hidden="true"></div>
      <span class="vivi-save-feedback-label">${escapeFeedbackLabel(label, "Saving")}</span>
    </div>
  `;
  root.setAttribute("aria-busy", "true");
}

/** Replace Saving (or show standalone) with a green tick + Saved leaflet, then auto-hide after 2s. */
export function endSavingDone(label = "Saved") {
  if (typeof window === "undefined") return;
  clearHideTimer();
  const root = ensureOverlay();
  root.classList.remove("is-saving");
  root.classList.add("is-visible", "is-saved");
  root.innerHTML = `
    <div class="vivi-save-feedback-card is-done" role="status">
      <span class="vivi-save-feedback-tick" aria-hidden="true">✓</span>
      <span class="vivi-save-feedback-label">${escapeFeedbackLabel(label, "Saved")}</span>
    </div>
  `;
  root.removeAttribute("aria-busy");
  hideTimer = window.setTimeout(() => {
    hideOverlay();
    hideTimer = null;
  }, SAVED_MS);
}

/** Dismiss Saving overlay; optionally show an error toast. */
export function endSavingError(message?: string) {
  if (typeof window === "undefined") return;
  clearHideTimer();
  hideOverlay();
  if (message) {
    // Dynamic import avoids a toast ↔ saveFeedback cycle that TDZ-crashes lazy route chunks.
    void import("./toast").then(({ showToast }) => showToast(message, "error"));
  }
}

/** Success feedback without a prior Saving state (green tick + Saved). */
export function showSaveDone(label = "Saved") {
  endSavingDone(label);
}

/** Toggle the shared required-missing highlight on a field container. */
export function setRequiredMissing(el: Element | null | undefined, missing: boolean) {
  if (!el) return;
  el.classList.toggle(REQUIRED_MISSING_CLASS, missing);
}
