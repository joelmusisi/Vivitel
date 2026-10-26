import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { fetchAssets, summarizeFleetStatus, type HomeStatusCounts } from "../api/fleet";
import { cardElevation, pressedStyle, pressFeedback } from "../theme/platform";

const EMPTY_COUNTS: HomeStatusCounts = { moving: 0, stopped: 0, idle: 0, offline: 0 };

const SLICES: Array<{ key: keyof HomeStatusCounts; label: string; color: string }> = [
  { key: "moving", label: "Moving", color: "#22c55e" },
  { key: "stopped", label: "Stopped", color: "#ef4444" },
  { key: "idle", label: "Idle", color: "#f59e0b" },
  { key: "offline", label: "Offline", color: "#64748b" }
];

const todayLabel = () =>
  new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });

export default function HomeScreen() {
  const [counts, setCounts] = useState<HomeStatusCounts>(EMPTY_COUNTS);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const assets = await fetchAssets();
      const summary = summarizeFleetStatus(assets);
      setCounts(summary.counts);
      setTotal(summary.total);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not load fleet status.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 60000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#38bdf8" colors={["#38bdf8"]} progressBackgroundColor="#111827" />}
    >
      <Text style={styles.date}>{todayLabel()}</Text>
      <Text style={styles.title}>Fleet overview</Text>

      {loading && total === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color="#38bdf8" />
          <Text style={styles.muted}>Loading fleet status…</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={[styles.card, cardElevation]}>
        <Text style={styles.cardTitle}>Vehicles</Text>
        <Text style={styles.total}>{total}</Text>
        <View style={styles.rows}>
          {SLICES.map((slice) => {
            const value = counts[slice.key];
            const pct = total === 0 ? 0 : Math.round((value / total) * 100);
            return (
              <View key={slice.key} style={styles.row}>
                <View style={[styles.dot, { backgroundColor: slice.color }]} />
                <Text style={styles.rowLabel}>{slice.label}</Text>
                <Text style={styles.rowValue}>
                  {value} ({pct}%)
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <Pressable
        {...pressFeedback}
        style={({ pressed }) => [styles.refreshButton, pressedStyle(pressed)]}
        onPress={() => void load(true)}
      >
        <Text style={styles.refreshText}>Refresh now</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b1220" },
  content: { padding: 20, paddingBottom: 32 },
  date: { color: "#64748b", marginBottom: 4 },
  title: { color: "#f8fafc", fontSize: 24, fontWeight: "700", marginBottom: 20 },
  center: { alignItems: "center", gap: 10, marginVertical: 24 },
  muted: { color: "#94a3b8" },
  error: { color: "#f87171", marginBottom: 12 },
  card: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#1f2937"
  },
  cardTitle: { color: "#94a3b8", fontSize: 13, fontWeight: "600", marginBottom: 8 },
  total: { color: "#f8fafc", fontSize: 40, fontWeight: "700", marginBottom: 16 },
  rows: { gap: 10 },
  row: { flexDirection: "row", alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  rowLabel: { color: "#e2e8f0", flex: 1 },
  rowValue: { color: "#cbd5e1", fontWeight: "600" },
  refreshButton: {
    marginTop: 16,
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden"
  },
  refreshText: { color: "#38bdf8", fontWeight: "600" }
});
