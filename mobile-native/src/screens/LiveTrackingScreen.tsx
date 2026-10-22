import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
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
import { assetDotStatusColor } from "../utils/assetStatus";

const REFRESH_MS = 30_000;

export default function LiveTrackingScreen() {
  const mapRef = useRef<MapView>(null);
  const [markers, setMarkers] = useState<LiveMapMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [degraded, setDegraded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [mapLayer, setMapLayer] = useState<MapLayerId>(DEFAULT_MAP_LAYER);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const result = await fetchLiveMapMarkers();
      setMarkers(result.markers);
      setDegraded(result.degraded);
      if (result.markers.length > 0) {
        const region = regionForMarkers(result.markers);
        mapRef.current?.animateToRegion(region, 450);
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

  const focusMarker = (marker: LiveMapMarker) => {
    setSelectedId(marker.id);
    mapRef.current?.animateToRegion(
      {
        latitude: marker.lat,
        longitude: marker.lng,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04
      },
      350
    );
  };

  const initialRegion = useMemo<Region>(() => regionForMarkers(markers), [markers]);

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
      >
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.lat, longitude: marker.lng }}
            title={marker.label}
            description={marker.subtitle}
            pinColor={assetDotStatusColor(marker.status)}
            onPress={() => setSelectedId(marker.id)}
          />
        ))}
      </TraccarTileMap>

      <View style={styles.topBar}>
        <View>
          <Text style={styles.topTitle}>Live tracking</Text>
          <Text style={styles.topSub}>
            {markers.length} on map{degraded ? " · telemetry degraded" : ""}
          </Text>
        </View>
        <Pressable style={styles.iconButton} onPress={() => void load(true)} disabled={refreshing}>
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
        style={styles.layerBar}
        contentContainerStyle={styles.layerBarContent}
      >
        {MAP_LAYERS.map((layer) => {
          const active = layer.id === mapLayer;
          return (
            <Pressable
              key={layer.id}
              style={[styles.layerChip, active && styles.layerChipActive]}
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
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{error}</Text>
        </View>
      ) : null}

      {selected ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>{selected.label}</Text>
          <Text style={styles.detailSub}>{selected.subtitle}</Text>
          {selected.address ? <Text style={styles.detailMeta}>{selected.address}</Text> : null}
          {selected.fixTime ? <Text style={styles.detailMeta}>Updated {selected.fixTime}</Text> : null}
        </View>
      ) : null}

      <Pressable style={styles.listToggle} onPress={() => setShowList((value) => !value)}>
        <Text style={styles.listToggleText}>{showList ? "Hide list" : `List (${markers.length})`}</Text>
      </Pressable>

      {showList ? (
        <View style={styles.listPanel}>
          <FlatList
            data={markers}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={styles.listRow} onPress={() => focusMarker(item)}>
                <View style={[styles.statusDot, { backgroundColor: assetDotStatusColor(item.status) }]} />
                <View style={styles.listTextWrap}>
                  <Text style={styles.listTitle}>{item.label}</Text>
                  <Text style={styles.listSub}>{item.subtitle}</Text>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              !loading ? <Text style={styles.listEmpty}>No assets with a live GPS fix.</Text> : undefined
            }
          />
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
    top: Platform.OS === "ios" ? 56 : 16,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155"
  },
  iconButtonText: { color: "#38bdf8", fontWeight: "600" },
  layerBar: {
    position: "absolute",
    top: Platform.OS === "ios" ? 118 : 78,
    left: 16,
    right: 16,
    maxHeight: 44
  },
  layerBarContent: { gap: 8, paddingRight: 8 },
  layerChip: {
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
    top: Platform.OS === "ios" ? 170 : 130,
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
    bottom: 88,
    backgroundColor: "rgba(17, 24, 39, 0.95)",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1f2937"
  },
  detailTitle: { color: "#f8fafc", fontWeight: "700", fontSize: 16 },
  detailSub: { color: "#cbd5e1", marginTop: 4 },
  detailMeta: { color: "#64748b", marginTop: 4, fontSize: 12 },
  listToggle: {
    position: "absolute",
    right: 16,
    bottom: 24,
    backgroundColor: "#111827",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#334155"
  },
  listToggleText: { color: "#38bdf8", fontWeight: "700" },
  listPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "42%",
    backgroundColor: "#111827",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: "#1f2937",
    paddingTop: 8
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937"
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  listTextWrap: { flex: 1 },
  listTitle: { color: "#f8fafc", fontWeight: "600" },
  listSub: { color: "#94a3b8", marginTop: 2, fontSize: 12 },
  listEmpty: { color: "#94a3b8", textAlign: "center", padding: 20 }
});
