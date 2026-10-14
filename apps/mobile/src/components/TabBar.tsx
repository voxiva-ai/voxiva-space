import { Clock, House, LayoutGrid, Layers, Settings } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../i18n";
import { useTheme } from "../theme";

export type TabId = "home" | "spaces" | "history" | "board" | "settings";

type Props = {
  active: TabId;
  onChange: (tab: TabId) => void;
};

const TABS: Array<{
  id: TabId;
  icon: typeof Layers;
  labelKey: "tabs.home" | "tabs.spaces" | "tabs.history" | "tabs.board" | "tabs.settings";
}> = [
  { id: "home", icon: House, labelKey: "tabs.home" },
  { id: "spaces", icon: Layers, labelKey: "tabs.spaces" },
  { id: "history", icon: Clock, labelKey: "tabs.history" },
  { id: "board", icon: LayoutGrid, labelKey: "tabs.board" },
  { id: "settings", icon: Settings, labelKey: "tabs.settings" },
];

/** Compact five-tab dock with visible labels. */
export function TabBar({ active, onChange }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingBottom: Math.max(insets.bottom, 10),
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
        },
      ]}
    >
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const on = tab.id === active;
          const Icon = tab.icon;
          return (
            <Pressable
              key={tab.id}
              style={styles.item}
              onPress={() => onChange(tab.id)}
              accessibilityRole="tab"
              accessibilityLabel={t(tab.labelKey)}
              accessibilityState={{ selected: on }}
            >
              <View
                style={[
                  styles.iconWrap,
                  on && { backgroundColor: colors.brandSoft },
                ]}
              >
                <Icon
                  size={22}
                  color={on ? colors.brand : colors.textTertiary}
                  strokeWidth={on ? 2.5 : 2}
                />
              </View>
              <Text style={[styles.label, { color: on ? colors.text : colors.textTertiary }]} numberOfLines={1}>
                {t(tab.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    paddingHorizontal: 8,
  },
  bar: { flexDirection: "row" },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 3,
  },
  iconWrap: {
    width: 48,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 10, fontWeight: "600", letterSpacing: 0.05 },
});
