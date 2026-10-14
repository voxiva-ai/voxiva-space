import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space, useTheme } from "../../theme";

type Props = {
  left?: ReactNode;
  right?: ReactNode;
  title?: string;
  subtitle?: string;
  /** Compact bar under safe area — no big marketing titles */
  children?: ReactNode;
};

/** cmux-like top chrome: icons left/right, optional short title, no brand kicker. */
export function TopChrome({ left, right, title, subtitle, children }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: colors.bg }}>
      <View style={styles.row}>
        <View style={styles.side}>{left}</View>
        <View style={styles.center}>
          {title ? (
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={[styles.sub, { color: colors.textTertiary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={[styles.side, styles.sideRight]}>{right}</View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    minHeight: 52,
  },
  side: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 40,
  },
  sideRight: { justifyContent: "flex-end" },
  center: { flex: 1, minWidth: 0, alignItems: "center" },
  title: { fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
  sub: { fontSize: 11, marginTop: 1 },
});
