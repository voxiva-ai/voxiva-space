import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { fetchSnapshot } from "../api";
import { SideRail } from "../components/SideRail";
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
import { DEMO_SNAPSHOT } from "../lib/demo";
import type { Device } from "../lib/devices";
import type { Snapshot, SpaceItem } from "../types";

type Props = {
  device: Device | null;
  onOpenWorkspace: (space: SpaceItem) => void;
};

export function WorkspacesScreen({ device, onOpenWorkspace }: Props) {
  const { t } = useI18n();
  const [snap, setSnap] = useState<Snapshot>(DEMO_SNAPSHOT);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [railId, setRailId] = useState<string | null>(DEMO_SNAPSHOT.spaces[0]?.id ?? null);

  const refresh = useCallback(async () => {
    if (!device) {
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

  useEffect(() => {
    if (snap.spaces.length && !snap.spaces.some((s) => s.id === railId)) {
      setRailId(snap.spaces[0]?.id ?? null);
    }
  }, [snap.spaces, railId]);

  const attentionIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of snap.sessions) {
      if (s.workspaceId && s.needsAttention) set.add(s.workspaceId);
    }
    return set;
  }, [snap.sessions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snap.spaces;
    return snap.spaces.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.cwd || "").toLowerCase().includes(q) ||
        (s.branch || "").toLowerCase().includes(q),
    );
  }, [snap.spaces, query]);

  function sessionLabel(count: number) {
    if (count <= 0) return t("spaces.sessionsNone");
    if (count === 1) return t("spaces.sessionsOne");
    return t("spaces.sessionsMany", { count });
  }

  function open(space: SpaceItem) {
    setRailId(space.id);
    onOpenWorkspace(space);
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

      <View style={styles.body}>
        <SideRail
          spaces={snap.spaces}
          activeId={railId}
          attentionIds={attentionIds}
          onSelect={open}
        />

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <EmptyBlock title={query ? t("spaces.emptySearch") : t("spaces.empty")} />
          ) : (
            filtered.map((item, index) => {
              const sessions = snap.sessions.filter((s) => s.workspaceId === item.id);
              const attention = attentionIds.has(item.id);
              const meta = [sessionLabel(sessions.length), item.branch]
                .filter(Boolean)
                .join(" · ");
              return (
                <ListRow
                  key={item.id}
                  title={item.name}
                  meta={meta}
                  attention={attention}
                  leading={
                    <AttentionRing active={attention} size={44}>
                      <WorkspaceAvatar
                        name={item.name}
                        index={index}
                        color={item.color}
                        size={36}
                      />
                    </AttentionRing>
                  }
                  onPress={() => open(item)}
                />
              );
            })
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, flexDirection: "row" },
  flex: { flex: 1 },
  list: { paddingBottom: 24, paddingTop: 4 },
});
