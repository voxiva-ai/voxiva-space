import { Terminal } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { SPACE_SWATCH } from "../theme";

type Props = {
  name: string;
  size?: number;
  index?: number;
  color?: string;
};

/** Outline terminal mark — matches desktop Space workspace icons. */
export function WorkspaceAvatar({ name: _name, size = 48, index = 0, color }: Props) {
  const tint = color || SPACE_SWATCH[Math.abs(index) % SPACE_SWATCH.length];
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size * 0.22,
        },
      ]}
    >
      <Terminal size={size * 0.52} color={tint} strokeWidth={2.35} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
});
