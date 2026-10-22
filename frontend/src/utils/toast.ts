import { toBrandDisplay } from "./brandLabels";
import { sanitizeFeedbackLabel } from "./uiMessage";

/** Success copy that should use the top Saved leaflet instead of a detail toast. */
function shouldUseSavedLeaflet(message: string): boolean {
  const text = String(message ?? "").toLowerCase();
  return (
    text.includes("asset saved") ||
    text.includes("saved to server") ||
    text.includes("configuration synced") ||
    text.includes("notification library saved") ||
    text.includes("parameter library saved") ||
    text.includes("location saved") ||
    text.includes("location binding saved") ||
    text.includes("location settings saved") ||
    text.includes("binding synced") ||
    text.includes("binding saved") ||
    text.includes("changes successfully saved") ||
    text.includes("commissioning confirmed") ||
    text.includes("commissioning complete") ||
    text.includes("commissioning saved") ||
    text.includes("computed attribute") ||
    text.includes("saved locally (backend offline)") ||
    text.includes("duplicated (saved")
  );
}

function toastGlyph(type: "info" | "success" | "error"): string {
  if (type === "success") return "✓";
  if (type === "error") return "!";
  return "i";
}

export function showToast(message: string, type: "info" | "success" | "error" = "info") {
  if (typeof window === "undefined") return;

  if (type === "success" && shouldUseSavedLeaflet(message)) {
    void import("./saveFeedback").then(({ showSaveDone }) => showSaveDone());
    return;
  }

  let container = document.getElementById("vivi-toasts");
  if (!container) {
    container = document.createElement("div");
    container.id = "vivi-toasts";
    container.className = "vivi-toasts";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }

  const el = document.createElement("div");
  el.className = `vivi-toast vivi-toast-${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.setAttribute("aria-live", type === "error" ? "assertive" : "polite");

  const icon = document.createElement("span");
  icon.className = "vivi-toast-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = toastGlyph(type);

  const label = document.createElement("span");
  label.className = "vivi-toast-label";
  label.textContent = toBrandDisplay(sanitizeFeedbackLabel(message, type === "error" ? "Something went wrong. Please retry." : "Saved"));

  el.appendChild(icon);
  el.appendChild(label);
  container.appendChild(el);

  // Re-trigger enter animation when stacking
  requestAnimationFrame(() => {
    el.classList.add("is-visible");
  });

  const duration = type === "error" ? 5200 : 3800;
  setTimeout(() => {
    el.classList.add("is-leaving");
    el.classList.remove("is-visible");
    setTimeout(() => el.remove(), 320);
  }, duration);
}
