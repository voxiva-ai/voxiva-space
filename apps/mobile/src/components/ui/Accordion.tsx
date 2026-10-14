import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown } from "lucide-react-native";
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from "react-native";
import { radius, space, useTheme } from "../../theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  title: string;
  hint?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function Accordion({ title, hint, icon, defaultOpen = false, children }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(defaultOpen);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <Pressable style={styles.head} onPress={toggle}>
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <View style={styles.headText}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {hint && !open ? (
            <Text style={[styles.hint, { color: colors.textTertiary }]} numberOfLines={1}>
              {hint}
            </Text>
          ) : null}
        </View>
        <ChevronDown
          size={18}
          color={colors.textTertiary}
          style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
        />
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: "600" },
  hint: { fontSize: 12, marginTop: 2 },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
});
