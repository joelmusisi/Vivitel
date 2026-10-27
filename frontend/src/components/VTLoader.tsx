import "./VTLoader.css";

interface VTLoaderProps {
  /** When true the loader covers the viewport; otherwise it fills its container. */
  fullscreen?: boolean;
  /** Accessible description only; the spinner itself shows no text. */
  label?: string;
  /** Smaller spinner with a shorter footprint for tables, lists and panels. */
  compact?: boolean;
}

const TICKS = Array.from({ length: 12 }, (_, index) => index);

/**
 * Universal loading indicator: a spinning ring of fading ticks, centred in the
 * container it is rendered in (or the viewport when `fullscreen`).
 */
export function VTLoader({ fullscreen = false, label, compact = false }: VTLoaderProps) {
  return (
    <div
      className={`vt-loader${fullscreen ? " vt-loader--full" : ""}${compact ? " vt-loader--compact" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={label ?? "Loading"}
    >
      <div className="vt-spinner" aria-hidden="true">
        {TICKS.map((tick) => (
          <i key={tick} style={{ ["--i" as string]: tick }} />
        ))}
      </div>
    </div>
  );
}

export default VTLoader;
