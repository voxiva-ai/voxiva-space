import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  CheckSquare,
  ChevronRight,
  CircleAlert,
  Layers,
  Monitor,
  Plus,
  QrCode,
} from "lucide-react-native";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { BrandMark } from "../components/BrandMark";
import { Card, Screen, SectionLabel, TopChrome } from "../components/ui";
import { useI18n } from "../i18n";
import { fetchSnapshot } from "../api";
import type { Device } from "../lib/devices";
import { radius, space, useTheme } from "../theme";
import type { BoardTask, Snapshot, SpaceItem } from "../types";

type Props = {
  device: Device | null;
  onPair: () => void;
  onOpenSpaces: () => void;
  onOpenBoard: () => void;
  onOpenWorkspace: (space: SpaceItem) => void;
};

export function HomeScreen({ device, onPair, onOpenSpaces, onOpenBoard, onOpenWorkspace }: Props) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [online, setOnline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!device) {
      setSnapshot(null);
      setOnline(false);
      return;
    }
    try {
      setSnapshot(await fetchSnapshot(device));
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, [device]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const spaces = snapshot?.spaces ?? [];
  const sessions = snapshot?.sessions ?? [];
  const activeTasks = Object.values(snapshot?.boards ?? {}).flat().filter(
    (task: BoardTask) => task.column !== "done" && task.column !== "cancelled",
  );
  const historySpaceId = snapshot?.history?.[0]?.workspaceId;
  const resumeSpace = spaces.find((item) => item.id === historySpaceId) ?? spaces[0];
  const connected = Boolean(device && online);

  return (
    <Screen noTopInset>
      <TopChrome
        left={
          <View style={styles.brandRow}>
            <View style={[styles.brandTile, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <BrandMark size={26} />
            </View>
            <View>
              <Text style={[styles.brand, { color: colors.text }]}>VOXIVA</Text>
              <Text style={[styles.brandSub, { color: colors.textTertiary }]}>SPACE</Text>
            </View>
          </View>
        }
        right={
          <Pressable
            onPress={onPair}
            accessibilityRole="button"
            accessibilityLabel={t("home.pair")}
            style={({ pressed }) => [
              styles.pairButton,
              { backgroundColor: colors.surface2, borderColor: colors.border, opacity: pressed ? 0.72 : 1 },
            ]}
          >
            <QrCode size={18} color={colors.text} strokeWidth={1.8} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await refresh();
              } finally {
                setRefreshing(false);
              }
            }}
            tintColor={colors.textSecondary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>{t("home.desktop")}</Text>
          <Text style={[styles.title, { color: colors.text }]}>{t("home.welcome")}</Text>
        </View>

        <Pressable
          onPress={device ? onOpenSpaces : onPair}
          accessibilityRole="button"
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Card style={styles.machineCard}>
            <View style={[styles.machineIcon, { backgroundColor: colors.surface2 }]}>
              <Monitor size={21} color={colors.text} strokeWidth={1.8} />
            </View>
            <View style={styles.grow}>
              <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                {device?.name ?? t("home.pair")}
              </Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: connected ? colors.success : colors.textTertiary }]} />
                <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                  {connected ? t("home.online") : device ? t("home.offline") : t("settings.noDevices")}
                </Text>
              </View>
            </View>
            <ChevronRight size={19} color={colors.textTertiary} />
          </Card>
        </Pressable>

        <View style={[styles.metrics, { borderColor: colors.border }]}>
          <Metric label={t("home.metricSpaces")} value={connected ? spaces.length : "—"} colors={colors} />
          <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
          <Metric label={t("home.metricSessions")} value={connected ? sessions.length : "—"} colors={colors} />
          <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
          <Metric label={t("home.metricTasks")} value={connected ? activeTasks.length : "—"} colors={colors} />
        </View>

        <View style={styles.sectionHeading}>
          <SectionLabel>{t("home.resume")}</SectionLabel>
          {resumeSpace ? (
            <Pressable onPress={onOpenSpaces} style={styles.textButton}>
              <Text style={[styles.textButtonLabel, { color: colors.textSecondary }]}>{t("home.openSpaces")}</Text>
              <ChevronRight size={14} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        {resumeSpace ? (
          <Pressable onPress={() => onOpenWorkspace(resumeSpace)} style={({ pressed }) => [pressed && styles.pressed]}>
            <Card style={styles.resumeCard}>
              <View style={[styles.resumeIcon, { backgroundColor: colors.brandSoft }]}>
                <ArrowRight size={19} color={colors.text} strokeWidth={1.8} />
              </View>
              <View style={styles.grow}>
                <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{resumeSpace.name}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[resumeSpace.branch, sessions.length ? t("home.sessions", { count: sessions.length }) : null].filter(Boolean).join(" · ") || resumeSpace.cwd}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textTertiary} />
            </Card>
          </Pressable>
        ) : (
          <Pressable onPress={onPair} style={({ pressed }) => [pressed && styles.pressed]}>
            <Card style={styles.connectCard}>
              <View style={[styles.connectIcon, { backgroundColor: colors.surface2 }]}>
                <Monitor size={20} color={colors.textSecondary} />
              </View>
              <View style={styles.grow}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{t("home.connectTitle")}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{t("home.connectHint")}</Text>
              </View>
              <ChevronRight size={18} color={colors.textTertiary} />
            </Card>
          </Pressable>
        )}

        <View style={styles.sectionHeading}>
          <SectionLabel>{t("home.tasks")}</SectionLabel>
          <Pressable onPress={onOpenBoard} style={styles.textButton}>
            <Text style={[styles.textButtonLabel, { color: colors.textSecondary }]}>{t("home.openBoard")}</Text>
            <ChevronRight size={14} color={colors.textSecondary} />
          </Pressable>
        </View>
        <Pressable onPress={onOpenBoard} style={({ pressed }) => [pressed && styles.pressed]}>
          <Card style={styles.taskCard}>
            <View style={[styles.taskIcon, { backgroundColor: colors.surface2 }]}>
              <CheckSquare size={18} color={colors.textSecondary} strokeWidth={1.8} />
            </View>
            <View style={styles.grow}>
              <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                {activeTasks.length ? activeTasks[0].title : t("home.noTasks")}
              </Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {connected ? t("home.taskCount", { count: activeTasks.length }) : t("home.connectHint")}
              </Text>
            </View>
            {activeTasks.length > 0 ? <CircleAlert size={17} color={colors.textSecondary} /> : <ChevronRight size={17} color={colors.textTertiary} />}
          </Card>
        </Pressable>

        <SectionLabel>{t("home.quickActions")}</SectionLabel>
        <View style={styles.actions}>
          <Action icon={<QrCode size={17} color={colors.text} />} label={t("home.pair")} onPress={onPair} colors={colors} />
          <Action icon={<Layers size={17} color={colors.text} />} label={t("home.openSpaces")} onPress={onOpenSpaces} colors={colors} />
          <Action icon={<Plus size={17} color={colors.text} />} label={t("home.openBoard")} onPress={onOpenBoard} colors={colors} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function Metric({ label, value, colors }: { label: string; value: number | string; colors: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.textTertiary }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  colors,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.72 : 1 },
      ]}
    >
      {icon}
      <Text style={[styles.actionText, { color: colors.text }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandTile: { width: 36, height: 36, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
  brandSub: { fontSize: 9, fontWeight: "700", letterSpacing: 2.2, marginTop: 2 },
  pairButton: { width: 38, height: 38, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  intro: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md },
  eyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 },
  title: { fontSize: 30, fontWeight: "800", letterSpacing: -1.15, lineHeight: 35 },
  machineCard: { flexDirection: "row", alignItems: "center", gap: 13, minHeight: 80, marginBottom: 0, borderRadius: radius.lg },
  machineIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 14, fontWeight: "700", letterSpacing: -0.2 },
  meta: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  metrics: { marginHorizontal: space.lg, marginTop: 12, marginBottom: 4, paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center" },
  metric: { flex: 1, alignItems: "center", gap: 3, minWidth: 0 },
  metricValue: { fontSize: 19, fontWeight: "700", fontVariant: ["tabular-nums"], letterSpacing: -0.45 },
  metricLabel: { fontSize: 9, fontWeight: "600", letterSpacing: 0.25 },
  metricDivider: { width: StyleSheet.hairlineWidth, height: 28 },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingRight: space.lg },
  textButton: { flexDirection: "row", alignItems: "center", gap: 1 },
  textButtonLabel: { fontSize: 11, fontWeight: "600" },
  resumeCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  resumeIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  connectCard: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72 },
  connectIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  taskCard: { flexDirection: "row", alignItems: "center", gap: 11 },
  taskIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", gap: 7, paddingHorizontal: space.lg },
  action: { flex: 1, minWidth: 0, minHeight: 52, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  actionText: { fontSize: 10, fontWeight: "600", flexShrink: 1 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
});
