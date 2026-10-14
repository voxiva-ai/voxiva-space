import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { WorkspaceAvatar } from "./WorkspaceAvatar";
import { AttentionRing } from "./ui";
import { space, useTheme } from "../theme";
import type { SpaceItem } from "../types";

type Props = {
  spaces: SpaceItem[];
  activeId?: string | null;
  attentionIds?: Set<string>;
  onSelect: (space: SpaceItem) => void;
};

/** cmux-style vertical workspace rail on the left. */
export function SideRail({ spaces, activeId, attentionIds, onSelect }: Props) {
  const { colors } = useTheme();

  if (spaces.length === 0) return null;

  return (
    <View
      style={[
        styles.rail,
        {
          backgroundColor: colors.surface,
          borderRightColor: colors.border,
        },
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {spaces.map((item, index) => {
          const on = item.id === activeId;
          const attention = attentionIds?.has(item.id);
          return (
            <Pressable
              key={item.id}
              onPress={() => onSelect(item)}
              style={({ pressed }) => [
                styles.item,
                on && {
                  backgroundColor: colors.brandSoft,
                  borderColor: colors.border,
                },
                pressed && { opacity: 0.8 },
              ]}
            >
              {on ? (
                <View style={[styles.tick, { backgroundColor: colors.brand }]} />
              ) : null}
              <AttentionRing active={attention} size={40}>
                <WorkspaceAvatar
                  name={item.name}
                  index={index}
                  color={item.color}
                  size={32}
                />
              </AttentionRing>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: 64,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  list: {
    alignItems: "center",
    gap: 8,
    paddingVertical: space.sm,
  },
  item: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    position: "relative",
  },
  tick: {
    position: "absolute",
    left: 0,
    width: 3,
    height: 16,
    borderRadius: 2,
  },
});
