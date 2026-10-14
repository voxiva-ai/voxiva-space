import { Search, X } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { radius, space, useTheme } from "../../theme";
import { IconButton } from "./IconButton";

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onClose?: () => void;
};

/** Full-width search strip — shown after tapping the search icon. */
export function SearchField({
  value,
  onChangeText,
  placeholder = "Search",
  autoFocus,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [autoFocus]);

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <Search size={15} color={colors.textTertiary} strokeWidth={2.2} />
      <TextInput
        ref={inputRef}
        style={[styles.input, { color: colors.text }]}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        value={value}
        onChangeText={onChangeText}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {onClose ? (
        <IconButton
          size={32}
          onPress={onClose}
          style={{ backgroundColor: "transparent", borderWidth: 0 }}
        >
          <X size={16} color={colors.textTertiary} />
        </IconButton>
      ) : null}
    </View>
  );
}

export function SearchIconButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <IconButton onPress={onPress}>
      <Search size={18} color={colors.text} strokeWidth={2.2} />
    </IconButton>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    paddingLeft: 12,
    paddingRight: 4,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
});
