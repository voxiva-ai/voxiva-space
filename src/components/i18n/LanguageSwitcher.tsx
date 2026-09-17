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
    <div
      className={`vs-welcomeLangSwitch${compact ? " is-compact" : ""}`}
      role="group"
      aria-label={t("settings.language")}
    >
      {LOCALES.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`vs-welcomeLangBtn${locale === item.id ? " is-active" : ""}`}
          onClick={() => setLocale(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
