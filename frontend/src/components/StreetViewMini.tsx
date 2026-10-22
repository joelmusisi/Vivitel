import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";

const loadGoogleMaps = (apiKey: string) => {
  if ((window as any).google?.maps) return Promise.resolve();
  if ((window as any).__gmapsLoader) return (window as any).__gmapsLoader as Promise<void>;
  const loader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
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

const pinIcon = L.divIcon({
  html: `<svg width="24" height="36" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24C24 5.373 18.627 0 12 0z" fill="#e53e3e"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg>`,
  className: "",
  iconSize: [24, 36],
  iconAnchor: [12, 36],
  popupAnchor: [0, -36]
});

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 18);
  }, [lat, lng, map]);
  return null;
}

function LeafletStreetView({ lat, lng }: { lat: number; lng: number }) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={18}
      zoomControl={false}
      attributionControl={false}
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[lat, lng]} icon={pinIcon} />
      <RecenterMap lat={lat} lng={lng} />
    </MapContainer>
  );
}

export default function StreetViewMini({ lat, lng, heading = 0, apiKey }: StreetViewMiniProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panoRef = useRef<any>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "nopano" | "nokey">("idle");
  const resolvedApiKey = useMemo(
    () => String(apiKey ?? (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ?? "").trim(),
    [apiKey]
  );
  const hasCoords = typeof lat === "number" && typeof lng === "number";

  useEffect(() => {
    if (!resolvedApiKey) {
      setStatus("nokey");
      return;
    }
    setStatus("loading");
    loadGoogleMaps(resolvedApiKey)
      .then(() => setStatus("ready"))
      .catch(() => setStatus("nokey"));
  }, [resolvedApiKey]);

  useEffect(() => {
    const gmaps = (window as any).google?.maps;
    if (!gmaps || !containerRef.current || !hasCoords || status === "nokey" || status === "loading") return;

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
    let cancelled = false;

    const applyPanorama = (data: any) => {
      if (cancelled || !panoRef.current || !data?.location?.latLng) return;
      setStatus("ready");
      panoRef.current.setPosition(data.location.latLng);
      panoRef.current.setPov({ heading, pitch: 0 });
      panoRef.current.setVisible(true);
    };

    const findPanorama = (radius: number) => {
      service.getPanorama({ location, radius, source: gmaps.StreetViewSource.DEFAULT }, (data: any, serviceStatus: string) => {
        if (cancelled) return;
        if (serviceStatus === "OK" && data?.location?.latLng) {
          applyPanorama(data);
          return;
        }
        if (radius < 200) {
          findPanorama(Math.min(200, radius * 2));
          return;
        }
        setStatus("nopano");
        panoRef.current?.setVisible(false);
      });
    };

    setStatus("loading");
    findPanorama(75);

    return () => {
      cancelled = true;
    };
  }, [lat, lng, heading, hasCoords, status === "nokey" ? "nokey" : resolvedApiKey]);

  if (!resolvedApiKey) {
    return (
      <div className="streetview-mini" aria-label="Street Map View">
        <div className="streetview-mini-title">Street Map View</div>
        <div className="streetview-mini-body" style={{ position: "relative" }}>
          {hasCoords ? (
            <LeafletStreetView lat={lat as number} lng={lng as number} />
          ) : (
            <div className="streetview-mini-overlay">Select an asset</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="streetview-mini" aria-label="Street View">
      <div className="streetview-mini-title">Street View</div>
      <div className="streetview-mini-body" ref={containerRef} />
      {!hasCoords && <div className="streetview-mini-overlay">Select an asset</div>}
      {hasCoords && status === "loading" && (
        <div className="streetview-mini-overlay">Loading Street View…</div>
      )}
      {hasCoords && status === "nopano" && (
        <div className="streetview-mini-overlay">No Street View available</div>
      )}
    </div>
  );
}
