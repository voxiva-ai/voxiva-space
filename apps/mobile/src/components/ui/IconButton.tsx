import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../../theme";

type Props = {
  children: ReactNode;
  onPress?: () => void;
  active?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
};

export function IconButton({
  children,
  onPress,
  active,
  size = 40,
  style,
  hitSlop = 8,
}: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      disabled={!onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? colors.brandSoft : colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: active ? colors.textTertiary : colors.border,
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function AttentionRing({
  active,
  children,
  size = 44,
}: {
  active?: boolean;
  children: ReactNode;
  size?: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2.5,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: active ? 2 : 0,
        borderColor: colors.brand,
        padding: active ? 2 : 0,
      }}
    >
      <View
        style={{
          flex: 1,
          width: "100%",
          borderRadius: size / 2.8,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface2,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}
