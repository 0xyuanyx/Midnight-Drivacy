import { Tabs } from "expo-router";

import { BottomTabBar } from "@/components/BottomTabBar";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={() => <BottomTabBar />}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="drive" />
      <Tabs.Screen name="application" />
    </Tabs>
  );
}
