import React from "react";
import { ActivityIndicator, Linking, StyleSheet, View } from "react-native";
import { NavigationContainer, DarkTheme, type LinkingOptions } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@react-native-vector-icons/ionicons/static";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons/static";
import { useAuth } from "../context/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import HomeScreen from "../screens/HomeScreen";
import LiveTrackingScreen from "../screens/LiveTrackingScreen";
import AssetsScreen from "../screens/AssetsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import { initialNotificationLink, onNotificationLink } from "../notifications/push";
import { colors, isIOS } from "../theme/platform";
import { linking as linkingConfig } from "./linking";

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

type TabName = "Home" | "Map" | "Assets" | "Profile";

/** SF-Symbol-style Ionicons on iOS, Material Design icons on Android. */
const TAB_ICONS: Record<TabName, { ios: [string, string]; android: [string, string] }> = {
  Home: { ios: ["home", "home-outline"], android: ["view-dashboard", "view-dashboard-outline"] },
  Map: { ios: ["map", "map-outline"], android: ["map-marker-radius", "map-marker-radius-outline"] },
  Assets: { ios: ["car", "car-outline"], android: ["truck", "truck-outline"] },
  Profile: { ios: ["person-circle", "person-circle-outline"], android: ["account-circle", "account-circle-outline"] }
};

function TabIcon({ route, focused, color, size }: { route: TabName; focused: boolean; color: string; size: number }) {
  const icons = TAB_ICONS[route];
  if (isIOS) {
    return <Ionicons name={(focused ? icons.ios[0] : icons.ios[1]) as any} size={size} color={color} />;
  }
  return <MaterialDesignIcons name={(focused ? icons.android[0] : icons.android[1]) as any} size={size} color={color} />;
}

/** Deep links from the OS plus taps on push notifications. */
const linking: LinkingOptions<{}> = {
  ...linkingConfig,
  async getInitialURL() {
    return (await Linking.getInitialURL()) ?? (await initialNotificationLink());
  },
  subscribe(listener) {
    const urlSub = Linking.addEventListener("url", ({ url }) => listener(url));
    const offNotification = onNotificationLink(listener);
    return () => {
      urlSub.remove();
      offNotification();
    };
  }
};

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        // iOS centres navigation titles; Material aligns them to the start.
        headerTitleAlign: isIOS ? "center" : "left",
        headerShadowVisible: !isIOS,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: isIOS ? 10 : 12, fontWeight: isIOS ? "500" : "600" },
        tabBarIcon: ({ focused, color, size }) => (
          <TabIcon route={route.name as TabName} focused={focused} color={color} size={size} />
        )
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} options={{ title: "Overview" }} />
      <Tabs.Screen
        name="Map"
        component={LiveTrackingScreen}
        options={{ title: "Live map", headerShown: false }}
      />
      <Tabs.Screen name="Assets" component={AssetsScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  const { bootstrapping, signedIn } = useAuth();

  if (bootstrapping) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={DarkTheme} linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: isIOS ? "default" : "fade_from_bottom" }}>
        {signedIn ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center"
  }
});
