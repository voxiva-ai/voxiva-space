import { Image } from "react-native";

export function BrandMark({ size = 36 }: { size?: number }) {
  return <Image source={require("../../assets/voxiva-space-mark.png")} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="Voxiva Space" />;
}
