import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

type MapZoomControlsOverlayProps = {
  map: L.Map | null | undefined;
  className?: string;
};

export function MapZoomControlsOverlay({ map, className }: MapZoomControlsOverlayProps) {
  return (
    <div className={`map-zoom-controls map-zoom-controls--overlay${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className="map-zoom-btn"
        aria-label="Zoom in"
        title="Zoom in"
        data-toast-ignore
        onClick={() => map?.zoomIn()}
      >
        +
      </button>
      <button
        type="button"
        className="map-zoom-btn"
        aria-label="Zoom out"
        title="Zoom out"
        data-toast-ignore
        onClick={() => map?.zoomOut()}
      >
        −
      </button>
    </div>
  );
}

export function MapZoomControls() {
  const map = useMap();

  useEffect(() => {
    map.zoomControl?.remove();

    const ZoomControl = L.Control.extend({
      options: { position: "topleft" },
      onAdd() {
        const container = L.DomUtil.create("div", "map-zoom-controls");
        const zoomIn = L.DomUtil.create("button", "map-zoom-btn", container);
        zoomIn.type = "button";
        zoomIn.setAttribute("aria-label", "Zoom in");
        zoomIn.title = "Zoom in";
        zoomIn.textContent = "+";

        const zoomOut = L.DomUtil.create("button", "map-zoom-btn", container);
        zoomOut.type = "button";
        zoomOut.setAttribute("aria-label", "Zoom out");
        zoomOut.title = "Zoom out";
        zoomOut.textContent = "−";

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(zoomIn, "click", (event) => {
          L.DomEvent.stop(event);
          map.zoomIn();
        });
        L.DomEvent.on(zoomOut, "click", (event) => {
          L.DomEvent.stop(event);
          map.zoomOut();
        });

        return container;
      }
    });

    const control = new ZoomControl();
    control.addTo(map);

    return () => {
      control.remove();
    };
  }, [map]);

  return null;
}
