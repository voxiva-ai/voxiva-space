import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { radius, space, useTheme } from "../../theme";

type Props = {
  title: string;
  meta?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  attention?: boolean;
  onPress?: () => void;
  muted?: boolean;
};

export function ListRow({
  title,
  meta,
  leading,
  trailing,
  attention,
  onPress,
  muted,
}: Props) {
  const { colors } = useTheme();

  const body = (
    <View style={[styles.row, muted && { opacity: 0.5 }]}>
      {attention != null ? (
        attention ? (
          <View style={[styles.attention, { backgroundColor: colors.brand }]} />
        ) : (
          <View style={styles.attentionSpacer} />
        )
      ) : null}
      {leading}
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {meta ? (
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {trailing ??
        (onPress ? <ChevronRight size={16} color={colors.textTertiary} /> : null)}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        pressed && { backgroundColor: colors.surface2, borderRadius: radius.lg },
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: space.sm,
    paddingVertical: 11,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
  },
  attention: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  attentionSpacer: { width: 8 },
  body: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  meta: {
    fontSize: 13,
    marginTop: 2,
  },
});
