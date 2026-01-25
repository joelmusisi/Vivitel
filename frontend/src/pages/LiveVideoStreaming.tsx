import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAssetsFromApi } from "../utils/api";
import "../index.css";

type StreamAsset = {
  id: string;
  description: string;
  registration: string;
  forward?: string;
  inCab?: string;
  camera3?: string;
  camera4?: string;
  liveEnabled?: boolean;
};

const initialAssets: StreamAsset[] = [];

const readStreamAssets = () => {
  const stored = localStorage.getItem("vivi.aiDevices") || localStorage.getItem("vivi.assets");
  if (!stored) return initialAssets;
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return initialAssets;
    return parsed.map((asset) => ({
      id: String(asset.id ?? asset.assetId ?? asset.registration ?? asset.assetDescription ?? Math.random()),
      description: asset.assetDescription ?? asset.description ?? asset.name ?? "—",
      registration: asset.registration ?? asset.registrationNumber ?? "—",
      forward: asset.forward ?? asset.forwardCamera,
      inCab: asset.inCab ?? asset.inCabCamera,
      camera3: asset.camera3,
      camera4: asset.camera4,
      liveEnabled: asset.aiDevice ?? asset.isAiDevice ?? true
    }));
  } catch {
    return initialAssets;
  }
};

type LiveVideoStreamingProps = {
  embed?: boolean;
};

export default function LiveVideoStreaming({ embed = false }: LiveVideoStreamingProps) {
  const navigate = useNavigate();
  const [streamAssets, setStreamAssets] = useState<StreamAsset[]>(() => readStreamAssets());
  const [filter, setFilter] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    const loadAssets = async () => {
      const apiAssets = await getAssetsFromApi<Record<string, unknown>>();
      if (!mounted) return;
      if (apiAssets.length) {
        const mapped = apiAssets.map((asset) => ({
          id: String(asset.id ?? asset.assetId ?? asset.registration ?? asset.assetDescription ?? Math.random()),
          description: String(asset.assetDescription ?? asset.description ?? asset.name ?? "—"),
          registration: String(asset.registration ?? asset.registrationNumber ?? "—"),
          forward: asset.forward ?? asset.forwardCamera,
          inCab: asset.inCab ?? asset.inCabCamera,
          camera3: asset.camera3,
          camera4: asset.camera4,
          liveEnabled: Boolean(asset.aiDevice ?? asset.isAiDevice ?? true)
        })) as StreamAsset[];
        setStreamAssets(mapped);
      }
    };
    void loadAssets();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshAssets = () => setStreamAssets(readStreamAssets());

  const filteredAssets = useMemo(() => {
    const normalized = filter.trim().toLowerCase();
    const base = showSelectedOnly
      ? streamAssets.filter((asset) => selectedIds.includes(asset.id))
      : streamAssets;
    if (!normalized) return base;
    return base.filter((asset) =>
      [asset.description, asset.registration].some((value) =>
        value.toLowerCase().includes(normalized)
      )
    );
  }, [filter, showSelectedOnly, selectedIds, streamAssets]);

  const allSelected =
    filteredAssets.length > 0 && filteredAssets.every((asset) => selectedIds.includes(asset.id));

  return (
    <div className={embed ? "live-stream-page live-embed" : "page live-stream-page"}>
      {!embed && (
        <div className="video-back-row">
          <button
            type="button"
            className="video-back-btn"
            onClick={() => navigate("/monitor/videos/dashboard")}
          >
            ← Back to Dashboard
          </button>
        </div>
      )}
      <div className="live-stream-card">
        <div className="live-stream-header">
          <div className="live-stream-title">
            <span>Assets</span>
            <span className="live-stream-count">{streamAssets.length}</span>
          </div>
          <label className="live-stream-checkbox">
            <input
              type="checkbox"
              checked={showSelectedOnly}
              onChange={(event) => setShowSelectedOnly(event.target.checked)}
            />
            Show selected assets
          </label>
          <div className="live-stream-actions">
            <button
              className="live-stream-btn"
              type="button"
              onClick={() => {
                alert("Intercom activation requested for selected assets.");
              }}
            >
              Activate Intercom
            </button>
            <button className="live-stream-icon" type="button" aria-label="Stop streaming">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 3l18 18" />
                <rect x="3" y="6" width="12" height="12" rx="2" />
                <path d="M15 10l6-3v10l-6-3" />
              </svg>
            </button>
            <button className="live-stream-icon live-stream-primary" type="button" aria-label="Start streaming">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5l12 7-12 7V5z" />
              </svg>
            </button>
            <button
              className="live-stream-refresh"
              type="button"
              data-nav="/measure/insights/reports?category=Dashboard%20Widgets&report=Asset%20Performance%20Dashboard%20Report"
            >
              View reports
            </button>
            <button className="live-stream-refresh" type="button" onClick={refreshAssets}>
              Refresh
            </button>
          </div>
        </div>
        <div className="live-stream-filter">
          <input
            type="search"
            placeholder="Filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filter assets"
          />
        </div>
        <div className="live-stream-table">
          <div className="live-stream-row live-stream-head">
            <div className="live-stream-cell checkbox">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allSelected}
                onChange={(event) => {
                  if (event.target.checked) {
                    setSelectedIds(filteredAssets.map((asset) => asset.id));
                  } else {
                    setSelectedIds([]);
                  }
                }}
              />
            </div>
            <div className="live-stream-cell">Asset description</div>
            <div className="live-stream-cell">Registration number</div>
            <div className="live-stream-cell">Forward</div>
            <div className="live-stream-cell">In cab</div>
            <div className="live-stream-cell">Camera 3</div>
            <div className="live-stream-cell">Camera 4</div>
            <div className="live-stream-cell">Intercom</div>
          </div>
          {filteredAssets.length === 0 ? (
            <div className="live-stream-row live-stream-empty">
              <div className="live-stream-empty-text">No records available.</div>
            </div>
          ) : (
            filteredAssets.map((asset) => (
              <div key={asset.id} className="live-stream-row">
                <div className="live-stream-cell checkbox">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(asset.id)}
                    onChange={(event) => {
                      setSelectedIds((current) =>
                        event.target.checked
                          ? [...current, asset.id]
                          : current.filter((id) => id !== asset.id)
                      );
                    }}
                    aria-label={`Select ${asset.description}`}
                  />
                </div>
                <div className="live-stream-cell">{asset.description}</div>
                <div className="live-stream-cell">{asset.registration}</div>
                <div className="live-stream-cell">
                  <button
                    className="live-stream-action"
                    type="button"
                    disabled={!asset.liveEnabled}
                  >
                    View live
                  </button>
                </div>
                <div className="live-stream-cell">
                  <button
                    className="live-stream-action"
                    type="button"
                    disabled={!asset.liveEnabled}
                  >
                    View live
                  </button>
                </div>
                <div className="live-stream-cell">
                  <button
                    className="live-stream-action"
                    type="button"
                    disabled={!asset.liveEnabled}
                  >
                    View live
                  </button>
                </div>
                <div className="live-stream-cell">
                  <button
                    className="live-stream-action"
                    type="button"
                    disabled={!asset.liveEnabled}
                  >
                    View live
                  </button>
                </div>
                <div className="live-stream-cell">
                  <button
                    className="live-stream-action"
                    type="button"
                    disabled={!asset.liveEnabled}
                    onClick={() => {
                      alert(`Intercom activation requested for ${asset.description}.`);
                    }}
                  >
                    Activate
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
