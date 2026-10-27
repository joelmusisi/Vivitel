import React from "react";
import { isChunkLoadError, reloadForStaleChunk } from "../utils/chunkRecovery";
import VTLoader from "./VTLoader";

export class ErrorBoundary extends React.Component<
  { title?: string; resetKey?: string; children: React.ReactNode },
  { hasError: boolean; message: string; recovering: boolean }
> {
  state = { hasError: false, message: "", recovering: false };

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
    if (isChunkLoadError(error)) {
      return { hasError: true, message, recovering: true };
    }
    return { hasError: true, message, recovering: false };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error(error);
    if (isChunkLoadError(error) && reloadForStaleChunk()) {
      return;
    }
    if (isChunkLoadError(error)) {
      // Cooldown already used — fall through to recoverable UI.
      this.setState({ recovering: false });
    }
  }

  componentDidUpdate(prevProps: Readonly<{ title?: string; resetKey?: string; children: React.ReactNode }>) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: "", recovering: false });
    }
  }

  private retry = () => {
    this.setState({ hasError: false, message: "", recovering: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.state.recovering) {
      return <VTLoader />;
    }

    const pageLabel = this.props.title ?? "Something went wrong";

    return (
      <div className="page">
        <section className="token-card">
          <div className="token-header">
            <div>
              <p className="eyebrow">Temporarily unavailable</p>
              <h2>{pageLabel}</h2>
              <p className="token-sub">
                This page hit a temporary loading issue. Try again — your work is not lost.
              </p>
            </div>
          </div>
          <div className="token-empty" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button type="button" className="btn primary" onClick={this.retry}>
              Try again
            </button>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Refresh page
            </button>
          </div>
        </section>
      </div>
    );
  }
}
