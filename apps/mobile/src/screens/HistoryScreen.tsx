import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react-native";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";
import { fetchSnapshot } from "../api";
import { WorkspaceAvatar } from "../components/WorkspaceAvatar";
import {
  AttentionRing,
  EmptyBlock,
  ListRow,
  Screen,
  SearchField,
  SearchIconButton,
  TopChrome,
} from "../components/ui";
import { useI18n } from "../i18n";
import { DEMO_SNAPSHOT, isDemoDevice } from "../lib/demo";
import type { Device } from "../lib/devices";
import { useTheme } from "../theme";
import type { HistoryItem, Snapshot, SpaceItem } from "../types";

type Props = {
  device: Device | null;
  onOpenWorkspace: (space: SpaceItem) => void;
};

function formatWhen(at: number, locale: string) {
  try {
    return new Date(at).toLocaleString(locale === "ru" ? "ru-RU" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function HistoryScreen({ device, onOpenWorkspace }: Props) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const [snap, setSnap] = useState<Snapshot>(DEMO_SNAPSHOT);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!device || isDemoDevice(device)) {
      setSnap(DEMO_SNAPSHOT);
      return;
    }
    try {
      setSnap(await fetchSnapshot(device));
    } catch {
      // keep last
    }
  }, [device]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2800);
    return () => clearInterval(timer);
  }, [refresh]);

  const spaceById = useMemo(() => {
    const map = new Map<string, SpaceItem>();
    for (const s of snap.spaces) map.set(s.id, s);
    return map;
  }, [snap.spaces]);

  const items = useMemo(() => {
    const list = [...(snap.history ?? [])];
    list.sort((a, b) => b.at - a.at);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (item) =>
        item.workspaceName.toLowerCase().includes(q) ||
        (item.cwd || "").toLowerCase().includes(q),
    );
  }, [snap.history, query]);

  function openItem(item: HistoryItem) {
    const alive = spaceById.get(item.workspaceId);
    if (alive) {
      onOpenWorkspace(alive);
      return;
    }
    onOpenWorkspace({
      id: item.workspaceId,
      name: item.workspaceName,
      cwd: item.cwd,
    });
  }

  return (
    <Screen noTopInset>
      <TopChrome
        right={
          searchOpen ? undefined : (
            <SearchIconButton onPress={() => setSearchOpen(true)} />
          )
        }
      >
        {searchOpen ? (
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder={t("spaces.search")}
            autoFocus
            onClose={() => {
              setQuery("");
              setSearchOpen(false);
            }}
          />
        ) : null}
      </TopChrome>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.list}
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
        {items.length === 0 ? (
          <EmptyBlock
            title={query ? t("history.emptySearch") : t("history.empty")}
            icon={<Clock size={22} color={colors.textTertiary} />}
          />
        ) : (
          items.map((item, index) => {
            const alive = spaceById.has(item.workspaceId);
            const meta = [formatWhen(item.at, locale), item.cwd]
              .filter(Boolean)
              .join(" · ");
            return (
              <ListRow
                key={`${item.workspaceId}-${item.at}-${index}`}
                title={item.workspaceName}
                meta={alive ? meta : `${meta} · ${t("history.gone")}`}
                muted={!alive}
                leading={
                  <AttentionRing size={40}>
                    <WorkspaceAvatar name={item.workspaceName} index={index} size={32} />
                  </AttentionRing>
                }
                onPress={alive ? () => openItem(item) : undefined}
              />
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingBottom: 24, paddingTop: 4 },
});
