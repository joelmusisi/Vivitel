import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TraccarTileMap from "../components/TraccarTileMap";
import {
  DEFAULT_MAP_LAYER,
  MAP_LAYERS,
  type MapLayerId
} from "../config/mapLayers";
import {
  fetchLiveMapMarkers,
  regionForMarkers,
  type LiveMapMarker
} from "../api/liveTracking";
import { assetDotStatusColor, assetDotStatusLabel } from "../utils/assetStatus";
import { cameraTargetAfterLoad } from "../utils/mapSelection";
import { colors, pressedStyle, pressFeedback, tapFeedback } from "../theme/platform";

const REFRESH_MS = 30_000;

export default function LiveTrackingScreen() {
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  // Overlays sit below the status bar / notch on both platforms instead of fixed offsets.
  const top = insets.top + 12;
  const [markers, setMarkers] = useState<LiveMapMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [degraded, setDegraded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapLayer, setMapLayer] = useState<MapLayerId>(DEFAULT_MAP_LAYER);
  // Read inside `load` (a stable callback) without re-creating the refresh timer.
  const selectedIdRef = useRef<string | null>(null);
  const fittedRef = useRef(false);
  const userMovedRef = useRef(false);

  const selectAsset = useCallback((id: string | null) => {
    selectedIdRef.current = id;
    setSelectedId(id);
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const result = await fetchLiveMapMarkers();
      setMarkers(result.markers);
      setDegraded(result.degraded);
      const target = cameraTargetAfterLoad(result.markers, selectedIdRef.current, {
        fitted: fittedRef.current,
        userMoved: userMovedRef.current
      });
      if (target?.kind === "fit") {
        mapRef.current?.animateToRegion(regionForMarkers(result.markers), 450);
        fittedRef.current = true;
      } else if (target?.kind === "follow") {
        // Keep the user's zoom; just track the selected vehicle's new position.
        mapRef.current?.animateCamera(
          { center: { latitude: target.marker.lat, longitude: target.marker.lng } },
          { duration: 350 }
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not load live positions.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const selected = useMemo(
    () => markers.find((marker) => marker.id === selectedId) ?? null,
    [markers, selectedId]
  );

  /** Select a tapped pin and centre on it, keeping the current zoom. */
  const selectMarker = (marker: LiveMapMarker) => {
    selectAsset(marker.id);
    mapRef.current?.animateCamera(
      { center: { latitude: marker.lat, longitude: marker.lng } },
      { duration: 300 }
    );
  };

  // Only used for the first frame; later camera moves go through the map ref.
  const initialRegion = useMemo<Region>(() => regionForMarkers([]), []);

  return (
    <View style={styles.root}>
      <TraccarTileMap
        ref={mapRef}
        style={styles.map}
        layerId={mapLayer}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsCompass
        loadingEnabled
        onPress={(event) => {
          // Tapping empty map clears the selection; marker taps also bubble here on iOS.
          if (event.nativeEvent.action !== "marker-press") selectAsset(null);
        }}
        onRegionChangeComplete={(_region, details) => {
          if (details?.isGesture) userMovedRef.current = true;
        }}
      >
        {markers.map((marker) => {
          const isSelected = marker.id === selectedId;
          return (
            <Marker
              // Re-key on selection so Android redraws the pin colour.
              key={`${marker.id}:${isSelected ? "sel" : ""}`}
              identifier={marker.id}
              coordinate={{ latitude: marker.lat, longitude: marker.lng }}
              pinColor={isSelected ? colors.accent : assetDotStatusColor(marker.status)}
              zIndex={isSelected ? 10 : 1}
              accessibilityLabel={`${marker.label}, ${assetDotStatusLabel(marker.status)}`}
              onPress={(event) => {
                event.stopPropagation();
                selectMarker(marker);
              }}
            />
          );
        })}
      </TraccarTileMap>

      <View style={[styles.topBar, { top }]}>
        <View>
          <Text style={styles.topTitle}>Live tracking</Text>
          <Text style={styles.topSub}>
            {markers.length} on map{degraded ? " · telemetry degraded" : ""}
          </Text>
        </View>
        <Pressable
          {...pressFeedback}
          style={({ pressed }) => [styles.iconButton, pressedStyle(pressed)]}
          onPress={() => {
            tapFeedback();
            void load(true);
          }}
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator color="#38bdf8" size="small" />
          ) : (
            <Text style={styles.iconButtonText}>Refresh</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.layerBar, { top: top + 62 }]}
        contentContainerStyle={styles.layerBarContent}
      >
        {MAP_LAYERS.map((layer) => {
          const active = layer.id === mapLayer;
          return (
            <Pressable
              key={layer.id}
              {...pressFeedback}
              style={({ pressed }) => [styles.layerChip, active && styles.layerChipActive, pressedStyle(pressed)]}
              onPress={() => setMapLayer(layer.id)}
            >
              <Text style={[styles.layerChipText, active && styles.layerChipTextActive]}>{layer.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading && markers.length === 0 ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#38bdf8" size="large" />
          <Text style={styles.loadingText}>Loading live positions…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.banner, { top: top + 114 }]}>
          <Text style={styles.bannerText}>{error}</Text>
        </View>
      ) : null}

      {selected ? (
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={[styles.statusDot, { backgroundColor: assetDotStatusColor(selected.status) }]} />
            <Text style={styles.detailTitle} numberOfLines={1}>
              {selected.label}
            </Text>
            <Pressable
              {...pressFeedback}
              accessibilityRole="button"
              accessibilityLabel="Close asset details"
              hitSlop={10}
              style={({ pressed }) => [styles.detailClose, pressedStyle(pressed)]}
              onPress={() => selectAsset(null)}
            >
              <Text style={styles.detailCloseText}>{"\u2715"}</Text>
            </Pressable>
          </View>
          <Text style={styles.detailSub}>{selected.subtitle}</Text>
          {selected.address ? <Text style={styles.detailMeta}>{selected.address}</Text> : null}
          {selected.fixTime ? <Text style={styles.detailMeta}>Updated {selected.fixTime}</Text> : null}
        </View>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b1220" },
  map: { ...StyleSheet.absoluteFill },
  topBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(17, 24, 39, 0.92)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#1f2937"
  },
  topTitle: { color: "#f8fafc", fontWeight: "700", fontSize: 16 },
  topSub: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  iconButton: {
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155"
  },
  iconButtonText: { color: "#38bdf8", fontWeight: "600" },
  layerBar: {
    position: "absolute",
    left: 16,
    right: 16,
    maxHeight: 44
  },
  layerBarContent: { gap: 8, paddingRight: 8 },
  layerChip: {
    overflow: "hidden",
    backgroundColor: "rgba(17, 24, 39, 0.92)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#334155"
  },
  layerChipActive: {
    backgroundColor: "#0f172a",
    borderColor: "#38bdf8"
  },
  layerChipText: { color: "#94a3b8", fontWeight: "600", fontSize: 12 },
  layerChipTextActive: { color: "#38bdf8" },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(11, 18, 32, 0.55)"
  },
  loadingText: { color: "#cbd5e1", marginTop: 12 },
  banner: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "rgba(127, 29, 29, 0.92)",
    borderRadius: 10,
    padding: 10
  },
  bannerText: { color: "#fecaca" },
  detailCard: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: "rgba(17, 24, 39, 0.95)",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1f2937"
  },
  detailHeader: { flexDirection: "row", alignItems: "center" },
  detailTitle: { color: "#f8fafc", fontWeight: "700", fontSize: 16, flex: 1 },
  detailClose: {
    marginLeft: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#1f2937"
  },
  detailCloseText: { color: "#94a3b8", fontSize: 13, fontWeight: "700" },
  detailSub: { color: "#cbd5e1", marginTop: 4 },
  detailMeta: { color: "#64748b", marginTop: 4, fontSize: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 }
});
