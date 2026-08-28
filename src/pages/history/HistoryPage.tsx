import { AgentHistoryPanel } from "@/components/shell/AgentHistoryPanel";
import { useSpace } from "@/features/workspace/SpaceContext";

export function HistoryPage() {
  const { t } = useSpace();

  return (
    <div className="vs-page vs-historyPage">
      <header className="vs-historyPageHead">
        <h1>{t("history.title")}</h1>
        <p>{t("history.lead")}</p>
      </header>
      <div className="vs-historyPageBody">
        <AgentHistoryPanel />
      </div>
    </div>
  );
}
