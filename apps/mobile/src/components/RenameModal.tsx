import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useI18n } from "../i18n";
import { radius, space, useTheme } from "../theme";

type Props = {
  visible: boolean;
  initial: string;
  onClose: () => void;
  onSave: (title: string) => void;
};

export function RenameModal({ visible, initial, onClose, onSave }: Props) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    if (visible) setDraft(initial || "Shell");
  }, [visible, initial]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={onClose}
      />
      <View style={styles.center} pointerEvents="box-none">
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.title, { color: colors.text }]}>{t("workspace.rename")}</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.surface2,
                borderColor: colors.border,
              },
            ]}
            value={draft}
            onChangeText={setDraft}
            placeholder="Shell"
            placeholderTextColor={colors.textTertiary}
            autoFocus
            selectTextOnFocus
            onSubmitEditing={() => onSave(draft.trim() || "Shell")}
            returnKeyType="done"
          />
          <View style={styles.row}>
            <Pressable style={styles.btn} onPress={onClose}>
              <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>
                {t("common.cancel")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.save, { backgroundColor: colors.text }]}
              onPress={() => onSave(draft.trim() || "Shell")}
            >
              <Text style={{ color: colors.bg, fontWeight: "700" }}>{t("common.save")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  center: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    paddingHorizontal: space.xl,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: 12,
  },
  title: { fontSize: 16, fontWeight: "700" },
  input: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  row: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md },
  save: {},
});
