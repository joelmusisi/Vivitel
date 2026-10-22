/** Same tile URLs as web Live Tracking / Traccar (Leaflet TileLayer). */
export type MapLayerId = "roadmap" | "terrain" | "satellite" | "hybrid";

export type MapLayerDef = {
  id: MapLayerId;
  label: string;
  url: string;
  attribution: string;
};

export const MAP_LAYERS: MapLayerDef[] = [
  {
    id: "roadmap",
    label: "Roadmap",
    url: "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    attribution: "© Google Maps"
  },
  {
    id: "terrain",
    label: "Terrain",
    url: "https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
    attribution: "© Google Maps"
  },
  {
    id: "satellite",
    label: "Satellite",
    url: "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attribution: "© Google Maps"
  },
  {
    id: "hybrid",
    label: "Hybrid",
    url: "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    attribution: "© Google Maps"
  }
];

export const DEFAULT_MAP_LAYER: MapLayerId = "roadmap";

/** react-native-maps UrlTile does not rotate subdomains; mt1 matches web Leaflet subdomains="0123". */
export function mapLayerTileTemplate(layerId: MapLayerId = DEFAULT_MAP_LAYER): string {
  const layer = MAP_LAYERS.find((row) => row.id === layerId) ?? MAP_LAYERS[0];
  return layer.url.replace("{s}", "1");
}
