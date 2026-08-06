import { useEffect, useMemo } from "react";
import { LiveGridPreview } from "@/components/shell/LiveGridPreview";
import { agentBots, isBotReady } from "@/features/agents/bots";
import type { GridPreset } from "@/features/workspace/layout";
import { useSpace } from "@/features/workspace/SpaceContext";
import type { MsgKey } from "@/i18n";
import { SPACE_COLORS, type SpaceColor } from "@/lib/types";

const LAYOUTS: Array<{ id: GridPreset; cells: number; labelKey: MsgKey; hintKey: MsgKey }> = [
  { id: 1, cells: 1, labelKey: "welcome.single", hintKey: "welcome.singleHint" },
  { id: 2, cells: 2, labelKey: "welcome.split", hintKey: "welcome.splitHint" },
  { id: 4, cells: 4, labelKey: "welcome.quad", hintKey: "welcome.quadHint" },
  { id: 8, cells: 8, labelKey: "welcome.oct", hintKey: "welcome.octHint" },
];

const selectableBots = agentBots.filter((bot) => bot.id !== "shell" && bot.command);

export type CreateSpaceSetupValue = {
  grid: GridPreset;
  agentIds: string[];
  includeBrowser: boolean;
  color: SpaceColor;
};

type CreateSpaceSetupProps = {
  value: CreateSpaceSetupValue;
  onChange: (next: CreateSpaceSetupValue) => void;
  showColor?: boolean;
  showPreview?: boolean;
  showBrowser?: boolean;
  compact?: boolean;
};

export function CreateSpaceSetup({
  value,
  onChange,
  showColor = true,
  showPreview = true,
  showBrowser = true,
  compact = false,
}: CreateSpaceSetupProps) {
  const { agentAvailability, agentsScanned, refreshAgents, t } = useSpace();

  useEffect(() => {
    void refreshAgents();
  }, [refreshAgents]);

  useEffect(() => {
    if (!agentsScanned) return;
    const ready = value.agentIds.filter((id) => {
      const bot = selectableBots.find((b) => b.id === id);
      return bot && isBotReady(bot, agentAvailability, true);
    });
    if (ready.length === value.agentIds.length) return;
    onChange({ ...value, agentIds: ready });
    // Only prune when availability changes — avoid loops on parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [agentAvailability, agentsScanned]);

  const slots = value.grid;

  const selectedSet = useMemo(() => new Set(value.agentIds), [value.agentIds]);

  function patch(partial: Partial<CreateSpaceSetupValue>) {
    onChange({ ...value, ...partial });
  }

  function setGrid(grid: GridPreset) {
    patch({
      grid,
      agentIds: value.agentIds.slice(0, grid),
    });
  }

  function toggleAgent(id: string) {
    const bot = selectableBots.find((b) => b.id === id);
    if (!bot) return;
    if (!isBotReady(bot, agentAvailability, agentsScanned)) return;

    if (selectedSet.has(id)) {
      patch({ agentIds: value.agentIds.filter((x) => x !== id) });
      return;
    }
    if (value.agentIds.length >= slots) return;
    patch({ agentIds: [...value.agentIds, id] });
  }

  return (
    <div className={`vs-createSetup${compact ? " is-compact" : ""}`}>
      <div className="vs-createSetupMain">
        <div className="vs-modalSection">
          <span className="vs-modalLabel">{t("projects.layout")}</span>
          <div className="vs-createLayoutGrid">
            {LAYOUTS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`vs-layoutCard${value.grid === item.id ? " is-active" : ""}`}
                onClick={() => setGrid(item.id)}
              >
                <div className={`vs-layoutPreview is-${item.cells}`} aria-hidden>
                  {Array.from({ length: item.cells }).map((_, i) => (
                    <span key={i} />
                  ))}
                </div>
                <strong>{t(item.labelKey)}</strong>
                <small>{t(item.hintKey)}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="vs-modalSection">
          <span className="vs-modalLabel">
            {t("projects.agents")}
            <em>
              {value.agentIds.length}/{slots}
            </em>
          </span>
          <p className="vs-createAgentsHint">{t("projects.agentsHint")}</p>
          <div className="vs-createAgentChips">
            {selectableBots
              .filter((bot) => isBotReady(bot, agentAvailability, agentsScanned))
              .map((bot) => {
              const selected = selectedSet.has(bot.id);
              const full = !selected && value.agentIds.length >= slots;
              return (
                <button
                  key={bot.id}
                  type="button"
                  className={`vs-createAgentChip${selected ? " is-selected" : ""}`}
                  disabled={full}
                  title={bot.description}
                  onClick={() => toggleAgent(bot.id)}
                >
                  <strong>{bot.name}</strong>
                  {selected ? (
                    <span className="vs-createAgentOrder">
                      {value.agentIds.indexOf(bot.id) + 1}
                    </span>
                  ) : null}
                </button>
              );
            })}
            {agentsScanned &&
              selectableBots.every((bot) => !isBotReady(bot, agentAvailability, agentsScanned)) && (
                <p className="vs-createAgentsHint">{t("projects.agentsNoneInstalled")}</p>
              )}
          </div>
        </div>

        {showBrowser && (
          <label className="vs-checkRow">
            <input
              type="checkbox"
              checked={value.includeBrowser}
              onChange={(e) => patch({ includeBrowser: e.target.checked })}
            />
            <span>
              <strong>{t("projects.withBrowser")}</strong>
              <small>{t("projects.withBrowserHint")}</small>
            </span>
          </label>
        )}

        {showColor && (
          <div className="vs-modalSection">
            <span className="vs-modalLabel">{t("projects.color")}</span>
            <div className="vs-colorRow">
              {SPACE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`vs-colorDot is-${c}${value.color === c ? " is-active" : ""}`}
                  aria-label={c}
                  onClick={() => patch({ color: c })}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {showPreview && (
        <div className="vs-createSetupPreview">
          <LiveGridPreview panes={value.grid} />
        </div>
      )}
    </div>
  );
}
