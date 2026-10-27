import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cmsv6DevMiddleware } from "./scripts/cmsv6-dev-middleware.mjs";
import desktopScaleCss from "./scripts/desktop-scale-postcss.mjs";
import { isRegionId, REGION_SERVERS } from "./src/utils/regionServers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Canonical API host; the workers.dev route currently returns 521 for operational API paths. */
const API_TARGET = "https://api.vivitelematics.ca";
/** Publish Worker for admin routes (e.g. site-group repair) not on the regional Worker. */
const WORKER_API_TARGET = "https://api.vivitelematics.ca";

const createProxyEntry = (target: string) => ({
  target,
  changeOrigin: true,
  secure: true,
  timeout: 60_000,
  proxyTimeout: 60_000,
  configure: (proxy: { on: (event: string, handler: (...args: any[]) => void) => void }) => {
    const applyNamedServer = (
      proxyReq: { setHeader: (name: string, value: string) => void },
      req: { headers?: Record<string, string | string[] | undefined>; url?: string }
    ) => {
      const raw = req.headers?.["x-vivi-region"];
      let named = String(Array.isArray(raw) ? raw[0] : raw ?? "").trim().toLowerCase();
      if (!isRegionId(named)) {
        try {
          named = String(new URL(String(req.url ?? ""), "http://127.0.0.1").searchParams.get("region") ?? "")
            .trim()
            .toLowerCase();
        } catch {
          named = "";
        }
      }
      if (!isRegionId(named)) return;
      proxyReq.setHeader("origin", `https://${REGION_SERVERS[named].host}`);
    };
    proxy.on("proxyReq", applyNamedServer);
    proxy.on("proxyReqWs", applyNamedServer);
    proxy.on("error", (error: Error, _req: unknown, res: { headersSent?: boolean; writeHead?: Function; end?: Function }) => {
      if (!res || res.headersSent || typeof res.writeHead !== "function") return;
      res.writeHead(503, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: error?.message || "API unavailable" }));
    });
  }
});

const proxyEntry = createProxyEntry(API_TARGET);
const workerProxyEntry = createProxyEntry(WORKER_API_TARGET);

const manualChunks = (id: string): string | undefined => {
  if (id.includes("node_modules")) {
    if (
      id.includes("react-dom") ||
      id.includes("react-router") ||
      /[/\\]react[/\\]/.test(id)
    ) {
      return "react-vendor";
    }
    if (id.includes("leaflet") || id.includes("@react-google-maps")) {
      return "maps-vendor";
    }
    if (id.includes("jspdf") || id.includes("exceljs") || id.includes("xlsx")) {
      return "export-vendor";
    }
    if (
      id.includes("react-datepicker") ||
      id.includes("react-time-picker") ||
      id.includes("react-clock")
    ) {
      return "ui-vendor";
    }
    return "vendor";
  }

  // Keep toast/saveFeedback out of the main index chunk so lazy pages do not
  // re-enter App/module graphs while those helpers initialize (TDZ crashes).
  if (/[/\\]utils[/\\](toast|saveFeedback|brandLabels)\.[tj]sx?$/.test(id)) {
    return "feedback-utils";
  }

  // Keep feature-module registries in stable, isolated chunks.
  const moduleMatch = id.match(/[/\\]modules[/\\](track|control|analyze|deliver|auth|mobile|marketing|home)[/\\]/);
  if (moduleMatch) {
    return `module-${moduleMatch[1]}`;
  }
  return undefined;
};

export default defineConfig({
  plugins: [cmsv6DevMiddleware(), react()],
  css: {
    postcss: {
      plugins: [desktopScaleCss()]
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@modules": path.resolve(__dirname, "src/modules"),
      "@shared": path.resolve(__dirname, "src/utils")
    }
  },
  build: {
    // Bust poisoned /assets/* CDN entries from prior SPA fallback misconfiguration.
    assetsDir: "static",
    target: "es2020",
    cssCodeSplit: true,
    modulePreload: { polyfill: true },
    // Current app bundle is intentionally large; alert only on much larger regressions.
    chunkSizeWarningLimit: 2500,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: false,
    proxy: {
      "/kv": proxyEntry,
      "/d1": proxyEntry,
      "/api": proxyEntry,
      "/auth": proxyEntry,
      "/ws": { ...proxyEntry, ws: true },
      "/admin": workerProxyEntry,
      "/rbac": proxyEntry,
      "/share": proxyEntry,
      "/device": proxyEntry,
      "/downloads": proxyEntry,
      "/ingest": proxyEntry,
      "/pat": proxyEntry,
      "/b2": proxyEntry,
      "/libraries": proxyEntry,
      "/stream": proxyEntry,
      "/user-alerts": proxyEntry,
      "/camera": proxyEntry,
      "/cmsv6": proxyEntry,
      "/intercom": proxyEntry,
      "/telemetry": proxyEntry,
      "/reports": proxyEntry
    }
  }
});
