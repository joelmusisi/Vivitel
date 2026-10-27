import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { isChunkLoadError, reloadForStaleChunk } from "./chunkRecovery";

// Pages with optional props are not assignable to ComponentType<unknown> (props are contravariant).
type LazyPage = ComponentType<any>;
type ModuleDefault<T extends LazyPage> = { default: T };

/**
 * Like React.lazy, but retries failed chunk fetches and reloads once on stale deploys
 * so route pages do not hard-fail with "Failed to fetch dynamically imported module".
 */
export function lazyWithRetry<T extends LazyPage>(
  factory: () => Promise<ModuleDefault<T>>,
  retries = 2
): LazyExoticComponent<T> {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await factory();
      } catch (error) {
        lastError = error;
        if (!isChunkLoadError(error) || attempt === retries) break;
        await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
      }
    }

    if (isChunkLoadError(lastError) && reloadForStaleChunk()) {
      // Hold Suspense open while the document reloads — avoids flashing the error card.
      return new Promise<ModuleDefault<T>>(() => undefined);
    }

    throw lastError;
  });
}
