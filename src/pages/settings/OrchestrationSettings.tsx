import { useEffect, useState } from "react";
import { ArrowLeftRight, Check, ClipboardCopy, GitBranch, ListChecks, Network, RefreshCw, Split, Workflow } from "lucide-react";
import { AgentBrandIcon } from "@/components/agents/AgentBrandIcon";
import { readTextFile, writeTextFile } from "@/features/editor/api";
import { useSpace, useView } from "@/features/workspace/SpaceContext";

const SKILL = "voxiva-orchestration";
const MANAGED = "<!-- Managed by Voxiva Space; updated from Orchestration settings. -->";
const targets = [
  { id: "codex", name: "Codex", path: `.agents/skills/${SKILL}/SKILL.md` },
  { id: "opencode", name: "OpenCode", path: `.opencode/skills/${SKILL}/SKILL.md` },
  { id: "gemini", name: "Gemini", path: `.gemini/skills/${SKILL}/SKILL.md` },
  { id: "cursor-agent", name: "Cursor", path: `.cursor/skills/${SKILL}/SKILL.md` },
] as const;
type Coverage = Record<(typeof targets)[number]["id"], boolean>;
const emptyCoverage = (): Coverage => ({ codex: false, opencode: false, gemini: false, "cursor-agent": false });
const storedDepth = () => {
  const value = Number(localStorage.getItem("voxiva.orchestration.depth"));
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : 1;
};

function skillText(depth: number) {
  return `---
name: ${SKILL}
description: Coordinate a coding task across independent agents, with clear ownership, safe handoffs, and a bounded worker tree.
---
${MANAGED}

# Voxiva orchestration

Use this workflow when a task has independent parts that can be reviewed separately.

1. Restate the goal, inspect the repository, and split work into small tasks with explicit file ownership. Keep dependent work sequential.
2. Delegate only when this agent provides a real subagent or handoff tool. Never claim that work was delegated if it was not. If no delegation tool is available, complete the work directly or ask the user before opening extra sessions.
3. Keep the worker tree at or below ${depth} nested generation${depth === 1 ? "" : "s"}. A worker must not create another worker at the limit.
4. Give each worker its scope, relevant context, expected result, and verification command. Avoid assigning the same files to multiple workers.
5. Wait for every worker, inspect its changes, resolve conflicts, and run the relevant checks on the integrated result.
6. Report what changed, what passed, and any work that remains. Do not present unverified work as complete.
`;
}

export function OrchestrationSettings() {
  const space = useSpace();
  const { setView } = useView();
  const ru = space.locale === "ru";
  const text = (en: string, russian: string) => ru ? russian : en;
  const [depth, setDepth] = useState(storedDepth);
  const [coverage, setCoverage] = useState<Coverage>(emptyCoverage);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const installedCount = targets.filter(({ id }) => coverage[id]).length;
  const root = space.activeWorkspace?.cwd;
  const content = skillText(depth);

  const recheck = async () => {
    if (!root) { setCoverage(emptyCoverage()); return; }
    setChecking(true); setError("");
    try {
      const results = await Promise.all(targets.map(async ({ id, path }) => {
        try { return [id, (await readTextFile(root, path)).content.includes(MANAGED)] as const; }
        catch { return [id, false] as const; }
      }));
      setCoverage(Object.fromEntries(results) as Coverage);
    } catch (cause) { setError(String(cause)); }
    finally { setChecking(false); }
  };

  useEffect(() => { void recheck(); }, [root]);

  const install = async () => {
    if (!root) { setError(text("Select a workspace before installing the skill.", "Сначала выберите рабочее пространство для установки навыка.")); return; }
    setInstalling(true); setError("");
    try {
      const existing = await Promise.all(targets.map(async ({ path }) => {
        try { return (await readTextFile(root, path)).content; }
        catch { return null; }
      }));
      if (existing.some((file) => file !== null && !file.includes(MANAGED))) {
        throw new Error(text("A skill file with this name already exists. Rename or move it first; Voxiva won't overwrite it.", "Файл навыка с таким именем уже существует. Сначала переименуйте или переместите его — Voxiva не будет его перезаписывать."));
      }
      await Promise.all(targets.map(({ path }) => writeTextFile(root, path, content)));
      await recheck();
    } catch (cause) { setError(String(cause)); }
    finally { setInstalling(false); }
  };

  const copyCommand = async () => {
    try {
      const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(content)));
      const command = `$d = Join-Path (Get-Location) '.agents/skills/${SKILL}'; New-Item -ItemType Directory -Force -Path $d | Out-Null; [IO.File]::WriteAllBytes((Join-Path $d 'SKILL.md'), [Convert]::FromBase64String('${encoded}'))`;
      await navigator.clipboard.writeText(command);
      setCopied(true); window.setTimeout(() => setCopied(false), 1800); setError("");
    } catch (cause) { setError(String(cause)); }
  };

  const changeDepth = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) return;
    setDepth(parsed);
    localStorage.setItem("voxiva.orchestration.depth", String(parsed));
  };

  const scenarios = [
    [ArrowLeftRight, text("Hand off an active task", "Передать текущую задачу"), text("Move a task to another agent with enough context to continue.", "Передайте задачу другому агенту вместе с контекстом для продолжения.")],
    [Network, text("Hand off to another worktree", "Передать задачу в другой worktree"), text("Continue in a separate branch without disturbing the current work.", "Продолжите работу в отдельной ветке, не затрагивая текущие изменения.")],
    [ListChecks, text("Run a phased workflow", "Выполнить работу по этапам"), text("Start each agent after the previous phase has been checked.", "Запускайте следующий этап после проверки предыдущего.")],
    [GitBranch, text("Run independent work in parallel", "Распараллелить независимые задачи"), text("Give each agent a separate scope and avoid overlapping files.", "Назначьте каждому агенту отдельную область и исключите пересечение файлов.")],
    [Split, text("Split a large change into smaller PRs", "Разделить крупное изменение на небольшие PR"), text("Keep each part independently reviewable and testable.", "Сделайте каждую часть отдельной для проверки и тестирования.")],
  ] as const;

  return <section className="vs-settingsPanelBody vs-settingsExtended vs-orchestration">
    <p className="vs-settingsHint">{text("Give compatible coding agents a shared, project-local workflow for delegation and handoffs.", "Единый проектный процесс для передачи задач и совместной работы совместимых CLI-агентов.")}</p>

    <article className="vs-orchestrationCard">
      <header className="vs-orchestrationSkillHead">
        <span className="vs-orchestrationIcon"><Workflow size={20} aria-hidden="true" /></span>
        <div><h3>{text("Orchestration skill", "Навык оркестрации")}</h3><p>{text("A reusable workflow installed in this workspace.", "Повторно используемый процесс, установленный в это рабочее пространство.")}</p></div>
        <span className={`vs-orchestrationBadge${installedCount === targets.length ? " is-ready" : ""}`}><i />{installedCount === targets.length ? text("Installed", "Установлен") : installedCount ? text("Partially installed", "Установлен частично") : text("Not installed", "Не установлен")}</span>
      </header>
      {!root && <p className="vs-orchestrationWorkspaceHint">{text("Select a project to install the skill into its agent folders.", "Выберите проект, чтобы установить навык в папки его агентов.")} <button type="button" className="vs-orchestrationInline" onClick={() => setView("projects")}>{text("Choose project", "Выбрать проект")}</button></p>}
      <p className="vs-orchestrationDisclaimer">{text("This adds instructions for agents that support skills; Voxiva does not launch or dispatch agents automatically.", "Это добавляет инструкции агентам с поддержкой навыков; Voxiva не запускает и не распределяет агентов автоматически.")}</p>
      <div className="vs-orchestrationActions">
        <button type="button" className="vs-btn vs-orchestrationPrimary" disabled={!root || installing} onClick={() => void install()}>{installing ? <RefreshCw size={14} className="vs-spin" aria-hidden="true" /> : installedCount === targets.length ? <Check size={14} aria-hidden="true" /> : <Workflow size={14} aria-hidden="true" />}{installing ? text("Installing…", "Установка…") : installedCount === targets.length ? text("Update skill", "Обновить навык") : text("Install", "Установить")}</button>
        <button type="button" className="vs-btn" disabled={!root || checking} onClick={() => void recheck()}><RefreshCw size={14} className={checking ? "vs-spin" : undefined} aria-hidden="true" />{checking ? text("Checking…", "Проверка…") : text("Re-check", "Проверить снова")}</button>
        <button type="button" className="vs-orchestrationInline" disabled={!root} onClick={() => void copyCommand()}>{copied ? <Check size={14} aria-hidden="true" /> : <ClipboardCopy size={14} aria-hidden="true" />}{copied ? text("Copied", "Скопировано") : text("Copy install command", "Скопировать команду установки")}</button>
      </div>
      {error && <p className="vs-orchestrationError" role="alert">{error}</p>}
      <div className="vs-orchestrationCoverage">
        <div><strong>{text("Agent coverage", "Поддержка агентов")}</strong><small>{text("Skills are checked in the selected workspace.", "Навык проверяется в выбранном рабочем пространстве.")}</small></div>
        <div className="vs-orchestrationAgents">{targets.map(({ id, name }) => <span className={coverage[id] ? "is-ready" : ""} key={id}><AgentBrandIcon id={id} size={15} /><strong>{name}</strong><small>{coverage[id] ? text("Ready", "Готов") : text("Missing", "Нет")}</small></span>)}</div>
      </div>
    </article>

    <div className="vs-orchestrationDepth">
      <label htmlFor="vs-orchestration-depth"><strong>{text("Nested worker depth", "Глубина вложенных исполнителей")}</strong><small>{text("Maximum number of delegated generations. 1 keeps work flat; higher values allow workers to delegate within this limit.", "Максимальное число уровней делегирования. 1 оставляет дерево плоским; большее значение разрешает вложенную передачу в заданных пределах.")}</small></label>
      <input id="vs-orchestration-depth" type="number" min={1} max={5} step={1} value={depth} onChange={(event) => changeDepth(event.target.value)} aria-label={text("Nested worker depth", "Глубина вложенных исполнителей")} />
    </div>

    <section className="vs-orchestrationHowTo"><h3>{text("How to use it", "Как пользоваться")}</h3><p>{text("Ask a coordinator agent to split independent work, hand off ownership, and verify the combined result.", "Попросите ведущего агента разделить независимые задачи, передать ответственность и проверить общий результат.")}</p>
      <div className="vs-orchestrationScenarioGrid">{scenarios.map(([Icon, title, description]) => <article className="vs-orchestrationScenario" key={title}><span><Icon size={17} aria-hidden="true" /></span><div><strong>{title}</strong><p>{description}</p></div></article>)}</div>
    </section>
  </section>;
}
