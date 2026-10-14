import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react-native";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { fetchSnapshot, sendTask } from "../api";
import {
  Card,
  EmptyBlock,
  IconButton,
  Screen,
  SectionLabel,
  TopChrome,
} from "../components/ui";
import { useI18n } from "../i18n";
import { DEMO_SNAPSHOT, isDemoDevice } from "../lib/demo";
import type { Device } from "../lib/devices";
import { radius, space, useTheme } from "../theme";
import type { BoardTask, Snapshot, SpaceItem, TaskPriority } from "../types";

type Props = {
  device: Device | null;
  workspaceId?: string | null;
};

type FlatTask = BoardTask & { workspaceId: string; workspaceName: string };

const COLUMNS: Array<{
  id: string;
  labelKey:
    | "board.col.todo"
    | "board.col.progress"
    | "board.col.review"
    | "board.col.done"
    | "board.col.cancelled";
}> = [
  { id: "todo", labelKey: "board.col.todo" },
  { id: "progress", labelKey: "board.col.progress" },
  { id: "review", labelKey: "board.col.review" },
  { id: "done", labelKey: "board.col.done" },
];

export function BoardScreen({ device, workspaceId }: Props) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [snap, setSnap] = useState<Snapshot>(DEMO_SNAPSHOT);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pickId, setPickId] = useState<string | null>(DEMO_SNAPSHOT.spaces[0]?.id ?? null);

  const refresh = useCallback(async () => {
    if (!device || isDemoDevice(device)) {
      setSnap(DEMO_SNAPSHOT);
      return;
    }
    try {
      setSnap(await fetchSnapshot(device));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }, [device, t]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2800);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (workspaceId) {
      setPickId(workspaceId);
      return;
    }
    if (!pickId && snap.spaces[0]) setPickId(snap.spaces[0].id);
  }, [workspaceId, snap.spaces, pickId]);

  const spaceName = useCallback(
    (id: string, spaces: SpaceItem[]) => spaces.find((s) => s.id === id)?.name || id,
    [],
  );

  const tasks = useMemo(() => {
    const boards = snap.boards ?? {};
    const out: FlatTask[] = [];
    if (workspaceId) {
      for (const task of boards[workspaceId] ?? []) {
        out.push({
          ...task,
          workspaceId,
          workspaceName: spaceName(workspaceId, snap.spaces),
        });
      }
      return out;
    }
    for (const [wsId, list] of Object.entries(boards)) {
      for (const task of list) {
        out.push({
          ...task,
          workspaceId: wsId,
          workspaceName: spaceName(wsId, snap.spaces),
        });
      }
    }
    out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return out;
  }, [snap.boards, snap.spaces, workspaceId, spaceName]);

  async function addTask() {
    const title = draft.trim();
    if (!title || !device || isDemoDevice(device)) return;
    const target = workspaceId || pickId;
    if (!target) {
      setError(t("board.pickWorkspace"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendTask(device, title, "medium" as TaskPriority, target);
      setDraft("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const showPicker = !workspaceId && snap.spaces.length > 1;

  return (
    <Screen noTopInset>
      <TopChrome
        right={
          <IconButton
            active
            onPress={() => void addTask()}
            style={!draft.trim() || busy || !device || isDemoDevice(device) ? { opacity: 0.35 } : undefined}
          >
            <Plus size={18} color={colors.brand} />
          </IconButton>
        }
      />
      {error ? (
        <Text style={[styles.err, { color: colors.danger }]}>{error}</Text>
      ) : null}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.pad}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refresh();
              setRefreshing(false);
            }}
            tintColor={colors.brand}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {showPicker ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pills}
          >
            {snap.spaces.map((s) => {
              const on = pickId === s.id;
              return (
                <Pressable
                  key={s.id}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: on ? colors.brandSoft : colors.surface,
                      borderColor: on ? colors.textTertiary : colors.border,
                    },
                  ]}
                  onPress={() => setPickId(s.id)}
                >
                  <Text
                    style={{
                      color: on ? colors.text : colors.textTertiary,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                    numberOfLines={1}
                  >
                    {s.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

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
            placeholder={t("board.placeholder")}
            placeholderTextColor={colors.textTertiary}
            value={draft}
            onChangeText={setDraft}
            editable={!busy && Boolean(device)}
            onSubmitEditing={() => void addTask()}
            returnKeyType="done"
          />
          <Pressable
            style={[
              styles.addBtn,
              { backgroundColor: colors.text },
              (!draft.trim() || busy || !device) && styles.addOff,
            ]}
            disabled={!draft.trim() || busy || !device}
            onPress={() => void addTask()}
          >
            <Plus size={18} color={colors.bg} />
          </Pressable>
        </View>

        {tasks.length === 0 ? (
          <EmptyBlock title={t("board.empty")} />
        ) : (
          COLUMNS.map((col) => {
            const items = tasks.filter((task) => task.column === col.id);
            if (items.length === 0) return null;
            return (
              <View key={col.id}>
                <SectionLabel>{`${t(col.labelKey)} · ${items.length}`}</SectionLabel>
                {items.map((task) => (
                  <Card key={`${task.workspaceId}-${task.id}`}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                      {task.title}
                    </Text>
                    <Text
                      style={{
                        color: colors.textTertiary,
                        fontSize: 12,
                        marginTop: 4,
                        textTransform: "capitalize",
                      }}
                    >
                      {!workspaceId ? `${task.workspaceName} · ` : ""}
                      {String(task.priority)}
                    </Text>
                  </Card>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingBottom: 32 },
  pills: {
    gap: 8,
    paddingHorizontal: space.lg,
    paddingBottom: 10,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 160,
  },
  addRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: space.lg,
    marginBottom: 12,
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
  err: {
    fontSize: 13,
    paddingHorizontal: space.lg,
    marginBottom: 8,
  },
});
