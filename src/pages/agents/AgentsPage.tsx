import {
  agentBots,
  isBotMissing,
  isBotReady,
  resolveBotCommand,
} from "@/features/agents/bots";
import { AgentBrandIcon } from "@/components/agents/AgentBrandIcon";
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

  const openSite = () => {
    if (!bot.installUrl) return;
    void openUrl(bot.installUrl).catch((err) => setError(clientError(err)));
  };

  return (
    <article className={`vs-agentCard${ready ? " is-ready" : " is-missing"}`}>
      <div className="vs-agentCardTop">
        <div className="vs-agentCardIdentity">
          <span className={`vs-agentIcon is-${bot.id}`} aria-hidden>
            <AgentBrandIcon id={bot.id} size={28} />
          </span>
          <h3 title={bot.name}>{bot.name}</h3>
        </div>
        <span className={`vs-badge${ready ? " is-ok" : ""}`}>
          {ready ? t("agents.installed") : t("agents.missing")}
        </span>
      </div>
      <div className="vs-agentActions">
        <button
          type="button"
          className="vs-btn vs-btnPrimary"
          disabled={!activeWorkspace}
          onClick={run}
        >
          {t("agents.launch")}
        </button>
        {bot.installUrl ? (
          <button type="button" className="vs-btn" onClick={openSite}>
            {t("agents.docs")}
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
        <div className="vs-agentHeaderActions">
          <span className="vs-badge is-ok">
            {installed.length} {t("agents.installed")}
          </span>
          <span className="vs-badge">
            {missing.length} {t("agents.missing")}
          </span>
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
