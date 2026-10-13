import { useSpace } from "@/features/workspace/SpaceContext";
import type { Locale } from "@/i18n";
import { DropdownSelect } from "@/components/DropdownSelect";

type Props = { compact?: boolean };

const LOCALES: Array<{ id: Locale; label: string }> = [
  { id: "en", label: "English" },
  { id: "ru", label: "Русский" },
];

export function LanguageSwitcher({ compact }: Props) {
  const { locale, setLocale, t } = useSpace();

  return (
    <DropdownSelect
      className={`vs-languageSelect${compact ? " is-compact" : ""}`}
      testId="language"
      label={t("settings.language")}
      value={locale}
      options={LOCALES.map(({ id, label }) => ({ value: id, label }))}
      onChange={(value) => setLocale(value as Locale)}
    />
  );
}
