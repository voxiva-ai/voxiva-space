import { useState, type ReactNode } from "react";
import {
  Languages,
  Monitor,
  Moon,
  QrCode,
  Sun,
  Smartphone,
  Trash2,
} from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { pair } from "../api";
import { Accordion, IconButton, Screen, TopChrome } from "../components/ui";
import { useI18n, type Locale } from "../i18n";
import {
  loadDevices,
  removeDevice,
  saveActiveDeviceId,
  type Device,
} from "../lib/devices";
import { radius, useTheme, type ThemePreference } from "../theme";

type Props = {
  devices: Device[];
  activeId: string | null;
  onScan: () => void;
  onDevicesChange: (devices: Device[], activeId: string | null) => void;
};

export function SettingsScreen({
  devices,
  activeId,
  onScan,
  onDevicesChange,
}: Props) {
  const { t, locale, setLocale } = useI18n();
  const { colors, preference, setPreference } = useTheme();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function selectDevice(id: string) {
    await saveActiveDeviceId(id);
    const device = devices.find((d) => d.id === id);
    if (device) {
      setBusyId(id);
      try {
        await pair(device);
      } catch {
        // keep offline
      } finally {
        setBusyId(null);
      }
    }
    onDevicesChange(devices, id);
  }

  async function forget(id: string) {
    await removeDevice(id);
    const next = await loadDevices();
    const nextActive = activeId === id ? next[0]?.id ?? null : activeId;
    if (nextActive) await saveActiveDeviceId(nextActive);
    onDevicesChange(next, nextActive);
  }

  function Choice({
    selected,
    label,
    icon,
    onPress,
  }: {
    selected: boolean;
    label: string;
    icon?: ReactNode;
    onPress: () => void;
  }) {
    return (
      <Pressable
        onPress={onPress}
        style={[
          styles.choice,
          {
            backgroundColor: selected ? colors.brandSoft : colors.surface2,
            borderColor: selected ? colors.textTertiary : colors.border,
          },
        ]}
      >
        {icon}
        <Text
          style={{
            color: selected ? colors.text : colors.textSecondary,
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  }

  const themes: Array<{ id: ThemePreference; label: string; icon: ReactNode }> = [
    {
      id: "system",
      label: t("settings.theme.system"),
      icon: <Smartphone size={16} color={colors.textSecondary} />,
    },
    {
      id: "dark",
      label: t("settings.theme.dark"),
      icon: <Moon size={16} color={colors.textSecondary} />,
    },
    {
      id: "light",
      label: t("settings.theme.light"),
      icon: <Sun size={16} color={colors.textSecondary} />,
    },
  ];

  const langs: Array<{ id: Locale; label: string }> = [
    { id: "en", label: t("settings.lang.en") },
    { id: "ru", label: t("settings.lang.ru") },
  ];

  return (
    <Screen noTopInset>
      <TopChrome
        left={
          <View style={[styles.accIcon, { backgroundColor: colors.brandSoft }]}>
            <Smartphone size={18} color={colors.brand} />
          </View>
        }
        title={t("tabs.settings")}
        subtitle={t("settings.appearanceHint")}
        right={
          <Text
            style={{
              color: colors.brand,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 0.4,
              textTransform: "uppercase",
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 8,
              backgroundColor: colors.brandSoft,
              overflow: "hidden",
            }}
          >
            {t("settings.beta")}
          </Text>
        }
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.pad}
        showsVerticalScrollIndicator={false}
      >
        <Accordion
          title={t("settings.appearance")}
          hint={t(`settings.theme.${preference}` as "settings.theme.dark")}
          defaultOpen
          icon={
            <View style={[styles.accIcon, { backgroundColor: colors.brandSoft }]}>
              <Moon size={16} color={colors.brand} />
            </View>
          }
        >
          <View style={styles.choiceRow}>
            {themes.map((item) => (
              <Choice
                key={item.id}
                selected={preference === item.id}
                label={item.label}
                icon={item.icon}
                onPress={() => setPreference(item.id)}
              />
            ))}
          </View>
        </Accordion>

        <Accordion
          title={t("settings.language")}
          hint={locale === "ru" ? t("settings.lang.ru") : t("settings.lang.en")}
          icon={
            <View style={[styles.accIcon, { backgroundColor: colors.surface2 }]}>
              <Languages size={16} color={colors.textSecondary} />
            </View>
          }
        >
          <View style={styles.choiceRow}>
            {langs.map((item) => (
              <Choice
                key={item.id}
                selected={locale === item.id}
                label={item.label}
                onPress={() => setLocale(item.id)}
              />
            ))}
          </View>
        </Accordion>

        <Accordion
          title={t("settings.devices")}
          hint={
            devices.length
              ? `${devices.length} · ${devices.find((d) => d.id === activeId)?.name || ""}`
              : t("settings.noDevices")
          }
          defaultOpen={devices.length > 0}
          icon={
            <View style={[styles.accIcon, { backgroundColor: colors.surface2 }]}>
              <Monitor size={16} color={colors.textSecondary} />
            </View>
          }
        >
          {devices.length === 0 ? (
            <Text style={{ color: colors.textTertiary, fontSize: 13 }}>
              {t("settings.noDevices")}
            </Text>
          ) : (
            devices.map((device) => {
              const on = device.id === activeId;
              return (
                <View key={device.id} style={styles.deviceRow}>
                  <Pressable style={{ flex: 1 }} onPress={() => void selectDevice(device.id)}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                      {device.name}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {[
                        device.host,
                        busyId === device.id ? t("settings.connecting") : null,
                        on ? t("settings.active") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </Pressable>
                  <IconButton size={34} onPress={() => void forget(device.id)}>
                    <Trash2 size={15} color={colors.danger} />
                  </IconButton>
                </View>
              );
            })
          )}
        </Accordion>

        <Accordion
          title={t("settings.pair")}
          hint={t("settings.pairHint")}
          defaultOpen={devices.length === 0}
          icon={
            <View style={[styles.accIcon, { backgroundColor: colors.brandSoft }]}>
              <QrCode size={16} color={colors.brand} />
            </View>
          }
        >
          <Pressable
            style={[styles.scanBtn, { backgroundColor: colors.text }]}
            onPress={onScan}
          >
            <QrCode size={20} color={colors.bg} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.scanTitle, { color: colors.bg }]}>{t("settings.scan")}</Text>
              <Text style={[styles.scanMeta, { color: colors.bg }]}>{t("settings.scanMeta")}</Text>
            </View>
          </Pressable>
        </Accordion>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingBottom: 48, paddingTop: 4 },
  accIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  scanTitle: { fontSize: 15, fontWeight: "700" },
  scanMeta: { fontSize: 12, opacity: 0.72, marginTop: 2 },
});
