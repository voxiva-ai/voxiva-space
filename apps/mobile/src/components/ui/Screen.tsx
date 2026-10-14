import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, space, useTheme } from "../../theme";

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /** Skip top safe inset when TopChrome already applied it */
  noTopInset?: boolean;
};

export function Screen({ children, scroll, contentStyle, style, noTopInset }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const pad = noTopInset ? undefined : { paddingTop: insets.top };

  if (scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[{ paddingBottom: 28 }, pad, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, pad, style]}>{children}</View>
  );
}

type EmptyBlockProps = {
  title?: string;
  hint?: string;
  icon?: ReactNode;
};

export function EmptyBlock({ title, hint, icon }: EmptyBlockProps) {
  const { colors } = useTheme();
  if (!title && !hint && !icon) {
    return <View style={{ height: 48 }} />;
  }
  return (
    <View style={styles.empty}>
      {icon}
      {title ? (
        <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>{title}</Text>
      ) : null}
      {hint ? (
        <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, style }: CardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          marginHorizontal: space.lg,
          marginBottom: 8,
          padding: 14,
          borderRadius: radius.lg,
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        color: colors.textTertiary,
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.6,
        textTransform: "uppercase",
        paddingHorizontal: space.lg,
        marginTop: space.md,
        marginBottom: space.sm,
      }}
    >
      {children}
    </Text>
  );
}

/** @deprecated Prefer TopChrome — kept so old imports compile briefly */
export function PageHeader({
  title,
  lead,
  right,
}: {
  kicker?: string;
  title: string;
  lead?: string;
  right?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        paddingHorizontal: space.lg,
        paddingTop: space.sm,
        paddingBottom: space.sm,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800", letterSpacing: -0.5 }}>
          {title}
        </Text>
        {lead ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>{lead}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function StatusBanner({ online, label }: { online: boolean; label: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginHorizontal: space.lg,
        marginBottom: space.sm,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: online ? colors.success : colors.danger,
        }}
      />
      <Text
        style={{
          flex: 1,
          color: online ? colors.textSecondary : colors.danger,
          fontSize: 13,
          fontWeight: "500",
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: space.xl,
    paddingVertical: 56,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 20,
  },
  emptyHint: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
});
