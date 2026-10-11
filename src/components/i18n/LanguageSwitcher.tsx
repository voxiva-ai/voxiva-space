import { useSpace } from "@/features/workspace/SpaceContext";
import type { Locale } from "@/i18n";

type Props = { compact?: boolean };

const LOCALES: Array<{ id: Locale; label: string }> = [
  { id: "en", label: "English" },
  { id: "ru", label: "Русский" },
];

export function LanguageSwitcher({ compact }: Props) {
  const { locale, setLocale, t } = useSpace();

  return (
    <div className={`vs-languageSelect${compact ? " is-compact" : ""}`}>
      <select
        aria-label={t("settings.language")}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        {LOCALES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </div>
  );
}
