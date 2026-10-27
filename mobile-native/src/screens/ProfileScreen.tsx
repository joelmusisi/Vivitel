import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { refreshAuthMe } from "../api/auth";
import { fetchHierarchy, type HierarchyDealer } from "../api/fleet";
import { APP_NAME } from "../config";
import { useAuth } from "../context/AuthContext";
import { getLastLoginEmail, getTenantId } from "../storage/session";
import { monoFont, pressedStyle, pressFeedback } from "../theme/platform";

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [tenantId, setTenantIdState] = useState("");
  const [hierarchy, setHierarchy] = useState<HierarchyDealer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [storedEmail, storedTenant, me, dealers] = await Promise.all([
        getLastLoginEmail(),
        getTenantId(),
        refreshAuthMe(),
        fetchHierarchy().catch(() => [] as HierarchyDealer[])
      ]);
      setEmail(storedEmail || String(me?.principal?.email ?? "").trim());
      setTenantIdState(String(me?.tenantId ?? storedTenant ?? "").trim());
      setHierarchy(dealers);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Native confirm dialog (UIAlertController on iOS, Material dialog on Android).
  const confirmSignOut = () =>
    Alert.alert("Sign out?", "You will stop receiving fleet alerts on this device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() }
    ]);

  const orgCount = hierarchy.reduce((sum, dealer) => sum + (dealer.organisations?.length ?? 0), 0);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#38bdf8" />
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>Signed in as</Text>
            <Text style={styles.value}>{email || "Unknown user"}</Text>
            {tenantId ? (
              <>
                <Text style={[styles.label, styles.spaced]}>Tenant</Text>
                <Text style={styles.valueMono}>{tenantId}</Text>
              </>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Organisation access</Text>
            <Text style={styles.value}>
              {hierarchy.length} dealer{hierarchy.length === 1 ? "" : "s"}, {orgCount} organisation
              {orgCount === 1 ? "" : "s"}
            </Text>
            <Text style={styles.hint}>
              Full site/org picker will mirror the web Control → Bindings flow in a later build.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>App</Text>
            <Text style={styles.value}>{APP_NAME}</Text>
            <Text style={styles.hint}>{Platform.OS === "ios" ? "iOS" : "Android"} · React Native with Hermes</Text>
          </View>

          <Pressable
            {...pressFeedback}
            style={({ pressed }) => [styles.signOut, pressedStyle(pressed)]}
            onPress={confirmSignOut}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b1220" },
  content: { padding: 20, paddingBottom: 32 },
  title: { color: "#f8fafc", fontSize: 24, fontWeight: "700", marginBottom: 20 },
  center: { alignItems: "center", padding: 24 },
  card: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1f2937",
    marginBottom: 12
  },
  label: { color: "#94a3b8", fontSize: 12, fontWeight: "600", marginBottom: 4 },
  spaced: { marginTop: 12 },
  value: { color: "#f8fafc", fontSize: 16, fontWeight: "600" },
  valueMono: { color: "#cbd5e1", fontFamily: monoFont, fontSize: 13 },
  hint: { color: "#64748b", marginTop: 8, fontSize: 13, lineHeight: 18 },
  signOut: {
    marginTop: 8,
    backgroundColor: "#1f2937",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden"
  },
  signOutText: { color: "#f87171", fontWeight: "700", fontSize: 16 }
});
