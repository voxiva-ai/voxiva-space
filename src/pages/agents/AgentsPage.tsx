import { agentBots, isBotReady, resolveBotCommand } from "@/features/agents/bots";
import { AgentBrandIcon } from "@/components/agents/AgentBrandIcon";
import { useSpace } from "@/features/workspace/SpaceContext";
import type { AgentBot } from "@/lib/types";

function AgentCard({ bot }: { bot: AgentBot }) {
  const { launchAgent, activeWorkspace, agentAvailability, t } = useSpace();

  const run = () =>
    void launchAgent({
      title: bot.name,
      command: resolveBotCommand(bot, agentAvailability),
      shell: bot.shell,
      accent: bot.accent,
    });

  return (
    <article className="vs-agentCard is-ready">
      <div className="vs-agentCardTop">
        <div className="vs-agentCardIdentity">
          <span className={`vs-agentIcon is-${bot.id}`} aria-hidden>
            <AgentBrandIcon id={bot.id} size={28} />
          </span>
          <h3 title={bot.name}>{bot.name}</h3>
        </div>
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
      </div>
    </article>
  );
}

export function AgentsPage() {
  const { agentAvailability, agentsScanned, refreshAgents, t } = useSpace();

  const ready = agentBots.filter((bot) => isBotReady(bot, agentAvailability, agentsScanned));

  return (
    <div className="vs-page">
      <div className="vs-pageHeader">
        <div className="vs-pageHeaderRow">
          <h2>{t("agents.title")}</h2>
          <button type="button" className="vs-btn" onClick={() => void refreshAgents()}>
            {t("agents.rescan")}
          </button>
        </div>
      </div>

      <div className="vs-agentGrid">
        {ready.map((bot) => (
          <AgentCard key={bot.id} bot={bot} />
        ))}
      </div>
    </div>
  );
}
