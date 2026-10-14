import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Bot,
  ChevronRight,
  ExternalLink,
  Globe,
  LayoutGrid,
  Plus,
  Terminal,
  X,
} from "lucide-react-native";
import {
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchSnapshot, renameSession, sendTask, spawnSession } from "../api";
import { RenameModal } from "../components/RenameModal";
import { IconButton, TopChrome } from "../components/ui";
import { useI18n } from "../i18n";
import { DEMO_SNAPSHOT, isDemoDevice } from "../lib/demo";
import type { Device } from "../lib/devices";
import { radius, SPACE_SWATCH, space as spacing, useTheme } from "../theme";
import type {
  AgentItem,
  BoardTask,
  BrowserItem,
  SessionItem,
  Snapshot,
  SpaceItem,
  TaskPriority,
} from "../types";

type Props = {
  device: Device;
  space: SpaceItem;
  onBack: () => void;
  onOpenSession: (session: SessionItem) => void;
};

type Tab = "terminals" | "browser" | "board";

const COLUMNS: Array<{
  id: string;
  labelKey:
    | "board.col.todo"
    | "board.col.progress"
    | "board.col.review"
    | "board.col.done";
}> = [
  { id: "todo", labelKey: "board.col.todo" },
  { id: "progress", labelKey: "board.col.progress" },
  { id: "review", labelKey: "board.col.review" },
  { id: "done", labelKey: "board.col.done" },
];

export function WorkspaceScreen({ device, space, onBack, onOpenSession }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>("terminals");
  const [snap, setSnap] = useState<Snapshot>(
    isDemoDevice(device) ? DEMO_SNAPSHOT : { spaces: [], sessions: [], boards: {} },
  );
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [spawnBusy, setSpawnBusy] = useState(false);
  const [spawnOpen, setSpawnOpen] = useState(false);
  const [error, setError] = useState("");
  const [renameTarget, setRenameTarget] = useState<SessionItem | null>(null);

  const refresh = useCallback(async () => {
    if (isDemoDevice(device)) {
      setSnap(DEMO_SNAPSHOT);
      setError("");
      return;
    }
    try {
      setSnap(await fetchSnapshot(device));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.offline"));
    }
  }, [device, t]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2800);
    return () => clearInterval(timer);
  }, [refresh]);

  const sessions = useMemo(
    () =>
      snap.sessions
        .filter((s) => s.workspaceId === space.id)
        .sort((a, b) => Number(Boolean(b.needsAttention)) - Number(Boolean(a.needsAttention))),
    [snap.sessions, space.id],
  );

  const tasks = useMemo(() => snap.boards?.[space.id] ?? [], [snap.boards, space.id]);

  const browsers = useMemo(
    () => (snap.browsers ?? []).filter((b) => b.workspaceId === space.id && b.url.trim()),
    [snap.browsers, space.id],
  );

  const readyAgents = useMemo(
    () => (snap.agents ?? []).filter((a) => a.ready && a.id !== "shell" && a.id !== "opencode"),
    [snap.agents],
  );

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  async function addTask() {
    const title = draft.trim();
    if (!title || isDemoDevice(device)) return;
    setBusy(true);
    setError("");
    try {
      await sendTask(device, title, "medium" as TaskPriority, space.id);
      setDraft("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function spawn(opts: { agentId?: string; title?: string; command?: string }) {
    if (isDemoDevice(device)) {
      setSpawnOpen(false);
      return;
    }
    setSpawnBusy(true);
    setError("");
    try {
      await spawnSession(device, { workspaceId: space.id, ...opts });
      setSpawnOpen(false);
      setTab("terminals");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSpawnBusy(false);
    }
  }

  async function openBrowser(item: BrowserItem) {
    try {
      await Linking.openURL(item.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function commitRename(title: string) {
    const target = renameTarget;
    setRenameTarget(null);
    if (!target) return;
    if (isDemoDevice(device)) {
      setSnap((prev) => ({
        ...prev,
        sessions: prev.sessions.map((s) =>
          s.id === target.id ? { ...s, title: title.trim() || "Shell" } : s,
        ),
      }));
      return;
    }
    try {
      await renameSession(device, target.id, title);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function sessionTitle(item: SessionItem) {
    return (item.title || "").trim() || "Shell";
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopChrome
        left={
          <IconButton onPress={onBack}>
            <ArrowLeft size={18} color={colors.text} />
          </IconButton>
        }
        title={space.name}
        subtitle={[space.branch, space.cwd].filter(Boolean).join(" · ") || undefined}
        right={
          <IconButton onPress={() => setSpawnOpen(true)} active>
            <Plus size={18} color={colors.brand} />
          </IconButton>
        }
      />

      <View style={styles.tabs}>
        {(
          [
            ["terminals", t("workspace.terminals"), Terminal],
            ["browser", t("workspace.browser"), Globe],
            ["board", t("workspace.board"), LayoutGrid],
          ] as const
        ).map(([id, label, Icon]) => {
          const on = tab === id;
          return (
            <Pressable
              key={id}
              style={[
                styles.tab,
                {
                  backgroundColor: on ? colors.brandSoft : colors.surface,
                  borderColor: on ? colors.textTertiary : colors.border,
                },
              ]}
              onPress={() => setTab(id)}
            >
              <Icon size={14} color={on ? colors.text : colors.textTertiary} />
              <Text
                style={{
                  color: on ? colors.text : colors.textTertiary,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.brand}
          />
        }
      >
        {error ? <Text style={{ color: colors.danger, paddingHorizontal: 16 }}>{error}</Text> : null}

        {tab === "terminals" ? (
          sessions.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              {t("workspace.sessionsEmpty")}
            </Text>
          ) : (
            sessions.map((item, i) => (
              <Pressable
                key={item.id}
                style={styles.row}
                onPress={() => onOpenSession({ ...item, title: sessionTitle(item) })}
                onLongPress={() => setRenameTarget(item)}
                delayLongPress={350}
              >
                {item.needsAttention ? (
                  <View style={[styles.dot, { backgroundColor: colors.brand }]} />
                ) : (
                  <View style={styles.dotSpacer} />
                )}
                <View
                  style={[
                    styles.icon,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Terminal
                    size={18}
                    color={SPACE_SWATCH[i % SPACE_SWATCH.length]}
                    strokeWidth={2.3}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>
                    {sessionTitle(item)}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                    {item.status === "online"
                      ? t("common.online")
                      : item.status || t("common.terminal")}
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textTertiary} />
              </Pressable>
            ))
          )
        ) : null}

        {tab === "browser" ? (
          browsers.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              {t("workspace.browserEmpty")}
            </Text>
          ) : (
            browsers.map((item) => (
              <Pressable
                key={`${item.paneId}-${item.url}`}
                style={styles.row}
                onPress={() => void openBrowser(item)}
              >
                <View style={styles.dotSpacer} />
                <View
                  style={[
                    styles.icon,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Globe size={18} color={colors.brand} strokeWidth={2.3} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}
                    numberOfLines={1}
                  >
                    {item.title || item.url}
                  </Text>
                  <Text
                    style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}
                    numberOfLines={1}
                  >
                    {item.url}
                  </Text>
                </View>
                <ExternalLink size={16} color={colors.textTertiary} />
              </Pressable>
            ))
          )
        ) : null}

        {tab === "board" ? (
          <>
            <View style={styles.addRow}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surface,
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
                placeholder={t("workspace.addTask")}
                placeholderTextColor={colors.textTertiary}
                value={draft}
                onChangeText={setDraft}
                editable={!busy}
                onSubmitEditing={() => void addTask()}
                returnKeyType="done"
              />
              <Pressable
                style={[
                  styles.addBtn,
                  { backgroundColor: colors.text },
                  (!draft.trim() || busy) && styles.addOff,
                ]}
                disabled={!draft.trim() || busy}
                onPress={() => void addTask()}
              >
                <Plus size={18} color={colors.bg} />
              </Pressable>
            </View>

            {COLUMNS.map((col) => {
              const items = tasks.filter((task) => task.column === col.id);
              return (
                <View key={col.id} style={{ marginBottom: 8 }}>
                  <Text
                    style={{
                      color: colors.textTertiary,
                      fontSize: 11,
                      fontWeight: "700",
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      paddingHorizontal: spacing.md,
                      marginBottom: 8,
                      marginTop: 8,
                    }}
                  >
                    {t(col.labelKey)} · {items.length}
                  </Text>
                  {items.length === 0 ? (
                    <Text
                      style={{
                        color: colors.textTertiary,
                        fontSize: 12,
                        paddingHorizontal: spacing.md,
                        marginBottom: 8,
                      }}
                    >
                      {t("workspace.boardEmpty")}
                    </Text>
                  ) : (
                    items.map((task) => <BoardCard key={task.id} task={task} />)
                  )}
                </View>
              );
            })}
          </>
        ) : null}
      </ScrollView>

      <SpawnSheet
        visible={spawnOpen}
        busy={spawnBusy}
        insetsBottom={insets.bottom}
        agents={readyAgents}
        onClose={() => setSpawnOpen(false)}
        onSpawnShell={() => void spawn({ agentId: "shell", title: t("workspace.spawnShell") })}
        onSpawnOpenCode={() =>
          void spawn({
            agentId: "opencode",
            title: t("workspace.spawnOpenCode"),
            command: "opencode",
          })
        }
        onSpawnAgent={(agent) =>
          void spawn({
            agentId: agent.id,
            title: agent.name,
            command: agent.command || undefined,
          })
        }
      />

      <RenameModal
        visible={Boolean(renameTarget)}
        initial={renameTarget ? sessionTitle(renameTarget) : "Shell"}
        onClose={() => setRenameTarget(null)}
        onSave={(title) => void commitRename(title)}
      />
    </View>
  );
}

function BoardCard({ task }: { task: BoardTask }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        marginHorizontal: spacing.md,
        marginBottom: 8,
        padding: 12,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>{task.title}</Text>
      <Text
        style={{
          color: colors.textTertiary,
          fontSize: 12,
          marginTop: 4,
          textTransform: "capitalize",
        }}
      >
        {String(task.priority)}
      </Text>
    </View>
  );
}

function SpawnSheet({
  visible,
  busy,
  insetsBottom,
  agents,
  onClose,
  onSpawnShell,
  onSpawnOpenCode,
  onSpawnAgent,
}: {
  visible: boolean;
  busy: boolean;
  insetsBottom: number;
  agents: AgentItem[];
  onClose: () => void;
  onSpawnShell: () => void;
  onSpawnOpenCode: () => void;
  onSpawnAgent: (agent: AgentItem) => void;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]}
          onPress={onClose}
        />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            paddingTop: 12,
            paddingHorizontal: spacing.md,
            paddingBottom: Math.max(insetsBottom, 16),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: spacing.sm,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>
              {t("workspace.spawnTitle")}
            </Text>
            <IconButton size={36} onPress={onClose}>
              <X size={18} color={colors.textSecondary} />
            </IconButton>
          </View>

          {busy ? (
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 13,
                paddingHorizontal: spacing.sm,
                marginBottom: 8,
              }}
            >
              {t("workspace.spawnBusy")}
            </Text>
          ) : null}

          <SpawnRow
            busy={busy}
            label={t("workspace.spawnShell")}
            icon={<Terminal size={18} color={colors.success} />}
            onPress={onSpawnShell}
          />
          <SpawnRow
            busy={busy}
            label={t("workspace.spawnOpenCode")}
            icon={<Bot size={18} color={colors.brand} />}
            onPress={onSpawnOpenCode}
          />

          {agents.length > 0 ? (
            <>
              <Text
                style={{
                  color: colors.textTertiary,
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  paddingHorizontal: spacing.sm,
                  marginVertical: 8,
                }}
              >
                {t("workspace.spawnReady")}
              </Text>
              {agents.map((agent) => (
                <SpawnRow
                  key={agent.id}
                  busy={busy}
                  label={agent.name}
                  icon={<Bot size={18} color={SPACE_SWATCH[2]} />}
                  onPress={() => onSpawnAgent(agent)}
                />
              ))}
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function SpawnRow({
  busy,
  label,
  icon,
  onPress,
}: {
  busy: boolean;
  label: string;
  icon: ReactNode;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 10,
          paddingHorizontal: spacing.sm,
          borderRadius: radius.md,
          opacity: busy ? 0.35 : 1,
        },
      ]}
      disabled={busy}
      onPress={onPress}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface2,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        }}
      >
        {icon}
      </View>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.lg,
    marginBottom: 8,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pad: { paddingHorizontal: spacing.sm },
  empty: {
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotSpacer: { width: 8 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  addRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.md,
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  addOff: { opacity: 0.35 },
});
