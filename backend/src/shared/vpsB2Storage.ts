/**
 * VPS multi-bucket B2 access via S3-compatible API.
 * Writes go to the purpose bucket (Track / Reports / default).
 * Reads try purpose then fall back to the legacy default bucket (no deletes).
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import {
  type B2Purpose,
  type B2PurposeEnv,
  resolveB2Credentials,
  resolveB2Purpose,
  resolveB2ReadCredentials,
  b2DefaultConfigured,
  b2TrackConfigured,
  b2ReportsConfigured
} from "./b2BucketRouter";

export type VpsB2PutArgs = {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  contentEncoding?: string;
  metadata?: Record<string, string>;
  /** Force purpose; default is derived from key. */
  purpose?: B2Purpose;
};

export type VpsB2Storage = {
  enabled: boolean;
  putObject: (args: VpsB2PutArgs) => Promise<boolean>;
  getObject: (key: string, purpose?: B2Purpose) => Promise<Buffer | null>;
  /** Legacy single-client handle for default-bucket callers. */
  defaultClient: S3Client | null;
  defaultBucket: string;
};

type ClientSlot = {
  client: S3Client;
  bucketName: string;
};

async function readBodyToBuffer(body: any): Promise<Buffer | null> {
  if (!body) return null;
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  if (typeof body.pipe === "function") {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      body.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      body.on("end", () => resolve());
      body.on("error", (err: Error) => reject(err));
    });
    return Buffer.concat(chunks);
  }
  return null;
}

function isMissingKeyError(err: unknown): boolean {
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  const code = String(e?.name ?? e?.Code ?? "");
  if (code === "NoSuchKey" || code === "NotFound" || code === "404") return true;
  if (e?.$metadata?.httpStatusCode === 404) return true;
  return false;
}

export function createVpsB2Storage(args: {
  env?: B2PurposeEnv;
  region?: string;
  endpoint?: string;
}): VpsB2Storage {
  const env: B2PurposeEnv = args.env ?? (process.env as B2PurposeEnv);
  const region = String(args.region ?? process.env.B2_REGION ?? "us-west-004").trim() || "us-west-004";
  const endpoint = String(args.endpoint ?? process.env.B2_ENDPOINT ?? "").trim() || undefined;

  const clients = new Map<string, ClientSlot>();

  const getSlot = (purpose: B2Purpose): ClientSlot | null => {
    const creds = resolveB2Credentials(env, purpose);
    if (!creds?.keyId || !creds.appKey || !creds.bucketName) return null;
    const id = `${creds.keyId}::${creds.bucketName}`;
    const existing = clients.get(id);
    if (existing) return existing;
    const client = new S3Client({
      region,
      credentials: { accessKeyId: creds.keyId, secretAccessKey: creds.appKey },
      endpoint,
      forcePathStyle: true
    });
    const slot = { client, bucketName: creds.bucketName };
    clients.set(id, slot);
    return slot;
  };

  // Enable when any purpose bucket is configured (Track/Reports alone is enough).
  const enabled =
    b2DefaultConfigured(env) || b2TrackConfigured(env) || b2ReportsConfigured(env);
  const defaultSlot = getSlot("default") ?? getSlot("track") ?? getSlot("reports");

  const putObject = async (putArgs: VpsB2PutArgs): Promise<boolean> => {
    const purpose = putArgs.purpose ?? resolveB2Purpose(putArgs.key);
    const creds = resolveB2Credentials(env, purpose);
    if (!creds) return false;
    const slot = getSlot(creds.purpose);
    if (!slot) return false;
    try {
      await slot.client.send(
        new PutObjectCommand({
          Bucket: slot.bucketName,
          Key: putArgs.key,
          Body: putArgs.body,
          ContentType: putArgs.contentType,
          ContentEncoding: putArgs.contentEncoding,
          Metadata: putArgs.metadata
        })
      );
      return true;
    } catch {
      return false;
    }
  };

  const getObject = async (key: string, purposeHint?: B2Purpose): Promise<Buffer | null> => {
    const targets = purposeHint
      ? (() => {
          const primary = resolveB2Credentials(env, purposeHint);
          if (!primary) return [];
          if (purposeHint === "default") return [primary];
          const fallback = resolveB2Credentials(env, "default");
          if (!fallback || fallback.bucketName === primary.bucketName) return [primary];
          return [primary, fallback];
        })()
      : resolveB2ReadCredentials(env, key);

    for (const creds of targets) {
      const slot = getSlot(creds.purpose);
      if (!slot) continue;
      try {
        const result = await slot.client.send(
          new GetObjectCommand({ Bucket: slot.bucketName, Key: key })
        );
        const buf = await readBodyToBuffer(result?.Body);
        if (buf) return buf;
      } catch (err) {
        if (isMissingKeyError(err)) continue;
        continue;
      }
    }
    return null;
  };

  return {
    enabled,
    putObject,
    getObject,
    defaultClient: defaultSlot?.client ?? null,
    defaultBucket: defaultSlot?.bucketName ?? ""
  };
}
