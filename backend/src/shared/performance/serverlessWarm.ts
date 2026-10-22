/**
 * Mitigate Cloudflare Worker cold starts by touching bindings once per isolate.
 * Scheduled/queue handlers share the same isolate so warm state persists.
 *
 * Prefer D1 over KV — a KV get() here burned daily read quota on every cold start
 * and contributed to login failures when the account hit "KV get() limit exceeded".
 */
let isolateWarmed = false;

export async function warmServerlessBindings(env: {
  ViviTEL?: { get: (key: string) => Promise<string | null> };
  VIVI_D1?: { prepare: (sql: string) => { first: () => Promise<unknown> } };
}): Promise<void> {
  if (isolateWarmed) return;
  isolateWarmed = true;
  try {
    if (env.VIVI_D1) {
      await env.VIVI_D1.prepare("SELECT 1").first();
      return;
    }
  } catch {
    // non-fatal — fall through
  }
  // Last resort only when D1 is unavailable; ignore quota errors.
  try {
    await env.ViviTEL?.get("__perf:warm");
  } catch {
    // non-fatal — bindings may be unavailable in local dev
  }
}

/** Cron/queue entry — parallel background warm without blocking the tick. */
export function scheduleServerlessWarm(
  ctx: { waitUntil: (p: Promise<unknown>) => void },
  env: {
    ViviTEL?: { get: (key: string) => Promise<string | null> };
    VIVI_D1?: { prepare: (sql: string) => { first: () => Promise<unknown> } };
  }
): void {
  ctx.waitUntil(warmServerlessBindings(env));
}
