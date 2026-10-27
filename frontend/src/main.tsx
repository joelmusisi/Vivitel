import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "./theme.css";
import { App } from "./App";
import { isChunkLoadError, reloadForStaleChunk } from "./utils/chunkRecovery";
import { isLoopbackHost, readRememberedRegion } from "./utils/regionServers";

// Ignore a known browser-extension rejection that is unrelated to app behavior.
if (typeof window !== "undefined") {
  if (isLoopbackHost(String(window.location.hostname ?? ""))) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const region = readRememberedRegion();
      if (!region) return originalFetch(input, init);
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      let targetHost = "";
      try {
        targetHost = new URL(rawUrl, window.location.origin).hostname;
      } catch {
        return originalFetch(input, init);
      }
      const toApp =
        isLoopbackHost(targetHost) ||
        targetHost.endsWith("vivitelematics.ca") ||
        targetHost.endsWith("workers.dev");
      if (!toApp) return originalFetch(input, init);
      const headers = new Headers(init?.headers);
      if (input instanceof Request) {
        input.headers.forEach((value, key) => {
          if (!headers.has(key)) headers.set(key, value);
        });
      }
      if (!headers.has("x-vivi-region")) headers.set("x-vivi-region", region);
      return originalFetch(input, { ...init, headers });
    };
  }
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("_vivi_chunk")) {
      url.searchParams.delete("_vivi_chunk");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
  } catch {
    // ignore
  }

  window.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    const reasonText = String(reason ?? "").trim();
    if (reasonText.includes("A listener indicated an asynchronous response by returning true")) {
      event.preventDefault();
      return;
    }
    // After a deploy, cached index.html can reference removed hashed chunks.
    if (isChunkLoadError(reason) || isChunkLoadError(reasonText)) {
      if (reloadForStaleChunk()) {
        event.preventDefault();
      }
    }
  });

  window.addEventListener("error", (event) => {
    const message = String((event as ErrorEvent).message ?? event.error ?? "");
    if (!isChunkLoadError(message) && !isChunkLoadError(event.error)) return;
    reloadForStaleChunk();
  });
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root container missing in index.html");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
