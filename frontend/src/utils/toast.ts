export type ToastType = "success" | "error" | "info";

let activeToast: HTMLDivElement | null = null;
let activeTimer = 0;

export function showToast(message: string, type: ToastType = "info") {
  if (typeof document === "undefined") return;
  if (activeToast) {
    activeToast.remove();
    window.clearTimeout(activeTimer);
  }

  const toast = document.createElement("div");
  toast.className = `global-toast global-toast-${type}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.body.appendChild(toast);
  activeToast = toast;

  activeTimer = window.setTimeout(() => {
    toast.remove();
    if (activeToast === toast) activeToast = null;
  }, 4000);
}
