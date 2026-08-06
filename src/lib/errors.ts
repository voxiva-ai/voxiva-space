export function clientError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();
  if (
    lower.includes("os error 2")
    || lower.includes("cannot find")
    || lower.includes("не удается найти")
    || lower.includes("not found")
    || lower.includes("pwsh")
  ) {
    return "Не удалось запустить shell. Выбери другой в Настройках.";
  }
  if (lower.includes("permission") || lower.includes("access")) {
    return "Нет доступа к папке. Выбери другую в Проектах.";
  }
  if (lower.includes("couldn't find a shell") || lower.includes("couldn't open the terminal")) {
    return "Не удалось открыть терминал. Попробуй ещё раз.";
  }
  if (lower.includes("createprocess") || lower.includes("failed to spawn") || raw.length > 160) {
    return "Не удалось открыть терминал. Попробуй другую папку или shell.";
  }
  if (raw.length > 120) {
    return "Что-то пошло не так. Попробуй ещё раз.";
  }
  return raw;
}
