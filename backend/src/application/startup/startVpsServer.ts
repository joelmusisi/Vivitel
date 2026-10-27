import type { Express } from "express";
import type { Server as HttpServer } from "http";

interface StartVpsServerDeps {
  app: Express;
  fs: any;
  httpsModule: any;
  port: number;
  hasSqlite: boolean;
  dbPath: string;
  workerForwardEnabled: boolean;
  workerForwardUrl: string;
  startTeltonikaTcpIngest: () => void;
  startConcoxTcpIngest: () => void;
  startQueclinkTcpIngest: () => void;
  configureHttpServer?: (server: HttpServer, app: Express) => void;
}

export function startVpsServer(deps: StartVpsServerDeps): void {
  const {
    app,
    fs,
    httpsModule,
    port,
    hasSqlite,
    dbPath,
    workerForwardEnabled,
    workerForwardUrl,
    startTeltonikaTcpIngest,
    startConcoxTcpIngest,
    startQueclinkTcpIngest,
    configureHttpServer,
  } = deps;

  startTeltonikaTcpIngest();
  startConcoxTcpIngest();
  startQueclinkTcpIngest();

  console.log(
    `Storage mode: ${hasSqlite ? "sqlite" : "memory"}` +
      `${hasSqlite ? ` (DB_PATH=${dbPath})` : ""}; ` +
      `Worker forward: ${workerForwardEnabled ? "enabled" : "disabled"} ` +
      `${workerForwardUrl ? `(url=${workerForwardUrl})` : ""}`
  );

  const certPath = process.env.TLS_CERT_PATH ?? "";
  const keyPath = process.env.TLS_KEY_PATH ?? "";
  const certPem = process.env.TLS_CERT ?? null;
  const keyPem = process.env.TLS_KEY ?? null;

  if ((certPath && keyPath) || (certPem && keyPem)) {
    let cert: string | Buffer;
    let key: string | Buffer;

    if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      cert = fs.readFileSync(certPath);
      key = fs.readFileSync(keyPath);
    } else if (certPem && keyPem) {
      cert = Buffer.from(certPem as string, "base64").toString();
      key = Buffer.from(keyPem as string, "base64").toString();
    } else {
      console.warn("TLS configured but cert/key not found; falling back to HTTP");
      const httpServer = app.listen(port, () => console.log(`Vivi telematics VPS API listening on http://0.0.0.0:${port}`));
      configureHttpServer?.(httpServer, app);
      return;
    }

    const httpsServer = httpsModule.createServer({ cert, key }, app);
    configureHttpServer?.(httpsServer, app);
    httpsServer.listen(port, () => {
      console.log(`Vivi telematics VPS API listening on https://0.0.0.0:${port}`);
    });
    return;
  }

  const httpServer = app.listen(port, () => {
    console.log(`Vivi telematics VPS API listening on http://0.0.0.0:${port}`);
  });
  configureHttpServer?.(httpServer, app);
}
