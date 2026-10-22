import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { fetchAssets, type FleetAsset } from "../api/fleet";

function assetLabel(asset: FleetAsset): string {
  return (
    String(asset.registration ?? "").trim() ||
    String(asset.assetDescription ?? "").trim() ||
    String(asset.assetId ?? asset.id ?? "").trim() ||
    "Unknown asset"
  );
}

function assetSubtitle(asset: FleetAsset): string {
  const parts = [
    String(asset.site ?? "").trim(),
    String(asset.imei ?? "").trim(),
    String(asset.status ?? "").trim()
  ].filter(Boolean);
  return parts.join(" · ");
}

export default function AssetsScreen() {
  const [assets, setAssets] = useState<FleetAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const rows = await fetchAssets();
      setAssets(rows);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not load assets.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((asset) => {
      const haystack = [
        asset.registration,
        asset.assetDescription,
        asset.assetId,
        asset.id,
        asset.site,
        asset.imei,
        asset.status
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");
      return haystack.includes(q);
    });
  }, [assets, query]);

  return (
    <View style={styles.root}>
      <TextInput
        placeholder="Search registration, site, IMEI…"
        placeholderTextColor="#64748b"
        style={styles.search}
        value={query}
        onChangeText={setQuery}
      />

      {loading && assets.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color="#38bdf8" />
          <Text style={styles.muted}>Loading assets…</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(item, index) => String(item.assetId ?? item.id ?? index)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#38bdf8" />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.center}>
              <Text style={styles.muted}>{query ? "No assets match your search." : "No assets found."}</Text>
            </View>
          ) : undefined
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowTitle}>{assetLabel(item)}</Text>
            {assetSubtitle(item) ? <Text style={styles.rowSub}>{assetSubtitle(item)}</Text> : null}
          </View>
        )}
        contentContainerStyle={filtered.length === 0 ? styles.emptyList : styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b1220" },
  search: {
    margin: 16,
    marginBottom: 8,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    color: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  center: { alignItems: "center", gap: 10, padding: 24 },
  muted: { color: "#94a3b8" },
  error: { color: "#f87171", paddingHorizontal: 16, marginBottom: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyList: { flexGrow: 1 },
  row: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1f2937"
  },
  rowTitle: { color: "#f8fafc", fontWeight: "700", fontSize: 16 },
  rowSub: { color: "#94a3b8", marginTop: 4, fontSize: 13 }
});
