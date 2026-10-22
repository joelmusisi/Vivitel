import React, { forwardRef } from "react";
import MapView, { UrlTile, type MapViewProps } from "react-native-maps";
import { DEFAULT_MAP_LAYER, mapLayerTileTemplate, type MapLayerId } from "../config/mapLayers";

type TraccarTileMapProps = Omit<MapViewProps, "mapType" | "provider"> & {
  layerId?: MapLayerId;
};

const TraccarTileMap = forwardRef<MapView, TraccarTileMapProps>(function TraccarTileMap(
  { layerId = DEFAULT_MAP_LAYER, children, ...props },
  ref
) {
  return (
    <MapView ref={ref} mapType="none" {...props}>
      <UrlTile urlTemplate={mapLayerTileTemplate(layerId)} maximumZ={20} tileSize={256} zIndex={-1} />
      {children}
    </MapView>
  );
});

export default TraccarTileMap;
