import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme";

type Props = {
  onKey: (payload: string) => void;
};

const KEYS: Array<{ label: string; payload: string; wide?: boolean }> = [
  { label: "↑", payload: "\x1b[A" },
  { label: "↓", payload: "\x1b[B" },
  { label: "←", payload: "\x1b[D" },
  { label: "→", payload: "\x1b[C" },
  { label: "Tab", payload: "\t", wide: true },
  { label: "Esc", payload: "\x1b", wide: true },
  { label: "Ctrl-C", payload: "\x03", wide: true },
  { label: "Ctrl-L", payload: "\x0c", wide: true },
  { label: "Enter", payload: "\r", wide: true },
];

export function KeyToolbar({ onKey }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {KEYS.map((key) => (
          <Pressable
            key={key.label}
            style={{
              minWidth: key.wide ? 58 : 38,
              height: 34,
              paddingHorizontal: 10,
              borderRadius: 10,
              backgroundColor: colors.surface2,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
            }}
            onPress={() => onKey(key.payload)}
          >
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
              {key.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
