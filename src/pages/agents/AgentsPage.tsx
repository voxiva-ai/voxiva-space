import {
  agentBots,
  isBotMissing,
  isBotReady,
  resolveBotCommand,
} from "@/features/agents/bots";
import { openUrl } from "@/features/terminal/api";
import { useSpace } from "@/features/workspace/SpaceContext";
import { clientError } from "@/lib/errors";
import type { AgentBot } from "@/lib/types";

function AgentCard({ bot, ready }: { bot: AgentBot; ready: boolean }) {
  const { launchAgent, activeWorkspace, agentAvailability, setError, t } = useSpace();

  const run = () =>
    void launchAgent({
      title: bot.name,
      command: resolveBotCommand(bot, agentAvailability),
      shell: bot.shell,
      accent: bot.accent,
    });

  const openInstall = () => {
    if (!bot.installUrl) return;
    void openUrl(bot.installUrl).catch((err) => setError(clientError(err)));
  };

  return (
    <article className={`vs-agentCard${ready ? " is-ready" : " is-missing"}`}>
      <div className="vs-agentCardTop">
        <h3>{bot.name}</h3>
        <span className={`vs-badge${ready ? " is-ok" : ""}`}>
          {ready ? t("agents.installed") : t("agents.missing")}
        </span>
      </div>
      {bot.description ? <p>{bot.description}</p> : null}
      <div className="vs-agentMeta">{resolveBotCommand(bot, agentAvailability) ?? "shell"}</div>
      <div className="vs-agentActions">
        {ready ? (
          <button
            type="button"
            className="vs-btn vs-btnPrimary"
            disabled={!activeWorkspace}
            onClick={run}
          >
            {t("agents.launch")}
          </button>
        ) : null}
        {bot.installUrl ? (
          <button
            type="button"
            className={ready ? "vs-btn" : "vs-btn vs-btnPrimary"}
            onClick={openInstall}
          >
            {ready ? t("agents.docs") : t("agents.install")}
          </button>
        ) : null}
        {!ready && activeWorkspace ? (
          <button type="button" className="vs-btn" onClick={run}>
            {t("agents.tryAnyway")}
          </button>
        ) : null}
        {!activeWorkspace ? (
          <button
            type="button"
            className="vs-btn"
            onClick={() => window.dispatchEvent(new CustomEvent("voxiva-new-space"))}
          >
            {t("space.openProjects")}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function AgentsPage() {
  const { agentAvailability, agentsScanned, refreshAgents, t } = useSpace();

  const installed = agentBots.filter((bot) => isBotReady(bot, agentAvailability, agentsScanned));
  const missing = agentBots.filter((bot) => isBotMissing(bot, agentAvailability, agentsScanned));

  return (
    <div className="vs-page">
      <div className="vs-pageHeader">
        <div className="vs-pageHeaderRow">
          <h2>{t("agents.title")}</h2>
          <button type="button" className="vs-btn" onClick={() => void refreshAgents()}>
            {t("agents.rescan")}
          </button>
        </div>
        <p className="vs-pageLead">{t("agents.lead")}</p>
        <div className="vs-agentHeaderActions">
          <span className="vs-badge is-ok">
            {installed.length} {t("agents.installed")}
          </span>
          <span className="vs-badge">
            {missing.length} {t("agents.missing")}
          </span>
          {!agentsScanned ? <span className="vs-badge">{t("agents.scanning")}</span> : null}
        </div>
      </div>

      <div className="vs-sectionLabel">{t("agents.sectionInstalled")}</div>
      <div className="vs-agentGrid">
        {installed.map((bot) => (
          <AgentCard key={bot.id} bot={bot} ready />
        ))}
      </div>

      {missing.length > 0 ? (
        <>
          <div className="vs-sectionLabel">{t("agents.sectionMissing")}</div>
          <p className="vs-agentMissingNote">{t("agents.missingBody")}</p>
          <div className="vs-agentGrid">
            {missing.map((bot) => (
              <AgentCard key={bot.id} bot={bot} ready={false} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
