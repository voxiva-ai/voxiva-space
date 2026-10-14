import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { Alert, BackHandler, PanResponder, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { parsePairUrl, pair } from "./src/api";
import { TabBar, type TabId } from "./src/components/TabBar";
import { I18nProvider, useI18n } from "./src/i18n";
import {
  loadActiveDeviceId,
  loadDevices,
  migrateLegacySession,
  saveActiveDeviceId,
  upsertDevice,
  type Device,
} from "./src/lib/devices";
import { BoardScreen } from "./src/screens/BoardScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ScanScreen } from "./src/screens/ScanScreen";
import { SessionScreen } from "./src/screens/SessionScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { WorkspaceScreen } from "./src/screens/WorkspaceScreen";
import { WorkspacesScreen } from "./src/screens/WorkspacesScreen";
import { DEMO_DEVICE } from "./src/lib/demo";
import { ThemeProvider, useTheme } from "./src/theme";
import type { SessionItem, SpaceItem } from "./src/types";

type StackRoute = "workspace" | "session" | "scan";
type Route = TabId | StackRoute;

function AppInner() {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("home");
  const [stack, setStack] = useState<StackRoute | null>(null);
  const [activeSpace, setActiveSpace] = useState<SpaceItem | null>(null);
  const [activeSession, setActiveSession] = useState<SessionItem | null>(null);

  const device = useMemo(
    () => devices.find((d) => d.id === activeId) ?? devices[0] ?? null,
    [devices, activeId],
  );

  /** Real PC if paired; demo host so UI is browsable before QR. */
  const runtimeDevice = device ?? DEMO_DEVICE;

  const route: Route = stack ?? tab;
  const showTabs = stack === null;
  const tabOrder: TabId[] = ["home", "spaces", "history", "board", "settings"];
  const goBack = useCallback(() => {
    if (stack === "session") {
      setActiveSession(null);
      setStack("workspace");
    } else if (stack === "workspace") {
      setActiveSpace(null);
      setActiveSession(null);
      setStack(null);
    } else if (stack === "scan") {
      setStack(null);
      setTab("settings");
    }
  }, [stack]);

  useEffect(() => {
    if (!stack) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack, stack]);

  const swipe = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        (stack === null && tab !== "board" && Math.abs(gesture.dx) > 36 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35) ||
        (stack !== null && gesture.moveX < 24 && gesture.dx > 36 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35),
      onPanResponderRelease: (_, gesture) => {
        if (stack !== null) {
          if (gesture.moveX < 24 && gesture.dx > 60) goBack();
          return;
        }
        if (Math.abs(gesture.dx) < 60) return;
        const next = tabOrder.indexOf(tab) + (gesture.dx < 0 ? 1 : -1);
        if (next >= 0 && next < tabOrder.length) setTab(tabOrder[next]);
      },
    }),
    [stack, tab, goBack],
  );

  const applyPairUrl = useCallback(async (url: string | null) => {
    if (!url) return;
    const next = parsePairUrl(url);
    if (!next) return;
    try {
      await pair(next);
    } catch (error) {
      Alert.alert(t("common.error"), error instanceof Error ? error.message : String(error));
      return;
    }
    const saved = await upsertDevice(next);
    const list = await loadDevices();
    setDevices(list);
    setActiveId(saved.id);
    setStack(null);
    setTab("home");
  }, [t]);

  useEffect(() => {
    void (async () => {
      await migrateLegacySession();
      const list = await loadDevices();
      const active = (await loadActiveDeviceId()) || list[0]?.id || null;
      setDevices(list);
      setActiveId(active);
      if (active) {
        const d = list.find((x) => x.id === active);
        if (d) {
          try {
            await pair(d);
          } catch {
            // offline
          }
        }
      }
      const initial = await Linking.getInitialURL();
      await applyPairUrl(initial);
      setReady(true);
    })();
    const sub = Linking.addEventListener("url", ({ url }) => {
      void applyPairUrl(url);
    });
    return () => sub.remove();
  }, [applyPairUrl]);

  function openWorkspace(space: SpaceItem) {
    setActiveSpace(space);
    setActiveSession(null);
    setStack("workspace");
  }

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      <View style={{ flex: 1 }} {...swipe.panHandlers}>
        {route === "scan" ? (
          <ScanScreen
            onBack={goBack}
            onPaired={async (next, id) => {
              setDevices(next);
              setActiveId(id);
              await saveActiveDeviceId(id);
              setStack(null);
              setTab("home");
            }}
          />
        ) : route === "session" && activeSession ? (
          <SessionScreen
            device={runtimeDevice}
            session={activeSession}
            onBack={goBack}
            onTitleChange={(title) => {
              setActiveSession((prev) => (prev ? { ...prev, title } : prev));
            }}
          />
        ) : route === "workspace" && activeSpace ? (
          <WorkspaceScreen
            device={runtimeDevice}
            space={activeSpace}
            onBack={goBack}
            onOpenSession={(session) => {
              setActiveSession(session);
              setStack("session");
            }}
          />
        ) : route === "home" ? (
          <HomeScreen
            device={device}
            onPair={() => setStack("scan")}
            onOpenSpaces={() => setTab("spaces")}
            onOpenBoard={() => setTab("board")}
            onOpenWorkspace={openWorkspace}
          />
        ) : route === "history" ? (
          <HistoryScreen device={runtimeDevice} onOpenWorkspace={openWorkspace} />
        ) : route === "board" ? (
          <BoardScreen device={runtimeDevice} />
        ) : route === "settings" ? (
          <SettingsScreen
            devices={devices}
            activeId={activeId}
            onScan={() => setStack("scan")}
            onDevicesChange={async (next, id) => {
              setDevices(next);
              setActiveId(id);
              if (id) await saveActiveDeviceId(id);
            }}
          />
        ) : (
          <WorkspacesScreen
            device={device}
            onOpenWorkspace={openWorkspace}
          />
        )}
      </View>
      {showTabs ? <TabBar active={tab} onChange={setTab} /> : null}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <AppInner />
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
