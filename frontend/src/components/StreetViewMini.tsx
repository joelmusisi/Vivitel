import { useEffect, useRef, useState } from "react";

const loadGoogleMaps = (apiKey: string) => {
  if ((window as any).google?.maps) return Promise.resolve();
  if ((window as any).__gmapsLoader) return (window as any).__gmapsLoader as Promise<void>;
  const loader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  (window as any).__gmapsLoader = loader;
  return loader;
};

type StreetViewMiniProps = {
  lat?: number;
  lng?: number;
  heading?: number;
  apiKey?: string;
};

export default function StreetViewMini({ lat, lng, heading = 0, apiKey }: StreetViewMiniProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panoRef = useRef<any>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "nopano" | "nokey">("idle");
  const hasCoords = typeof lat === "number" && typeof lng === "number";

  useEffect(() => {
    if (!apiKey) {
      setStatus("nokey");
      return;
    }
    setStatus("loading");
    loadGoogleMaps(apiKey)
      .then(() => setStatus("ready"))
      .catch(() => setStatus("nokey"));
  }, [apiKey]);

  useEffect(() => {
    const gmaps = (window as any).google?.maps;
    if (!gmaps || !containerRef.current || !hasCoords || status === "nokey") return;

    if (!panoRef.current) {
      panoRef.current = new gmaps.StreetViewPanorama(containerRef.current, {
        addressControl: false,
        fullscreenControl: false,
        linksControl: false,
        panControl: false,
        enableCloseButton: false,
        motionTracking: false,
        zoomControl: false,
        showRoadLabels: true
      });
    }

    const service = new gmaps.StreetViewService();
    const location = new gmaps.LatLng(lat, lng);
    service.getPanorama({ location, radius: 50 }, (data: any, serviceStatus: string) => {
      if (serviceStatus === "OK" && data?.location?.latLng) {
        setStatus("ready");
        panoRef.current.setPosition(data.location.latLng);
        panoRef.current.setPov({ heading, pitch: 0 });
        panoRef.current.setVisible(true);
      } else {
        setStatus("nopano");
        panoRef.current.setVisible(false);
      }
    });
  }, [lat, lng, heading, hasCoords, status]);

  return (
    <div className="streetview-mini" aria-label="Street View">
      <div className="streetview-mini-title">Street View</div>
      <div className="streetview-mini-body" ref={containerRef} />
      {!apiKey && <div className="streetview-mini-overlay">Add VITE_GOOGLE_MAPS_API_KEY</div>}
      {apiKey && !hasCoords && <div className="streetview-mini-overlay">Select an asset</div>}
      {apiKey && hasCoords && status === "nopano" && (
        <div className="streetview-mini-overlay">No Street View available</div>
      )}
    </div>
  );
}
