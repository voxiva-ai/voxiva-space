import { useEffect, useState } from "react";
import {
  termLineClass,
  type WelcomeTypingProfile,
} from "@/components/shell/welcomePreviewLines";

type Props = {
  lines: string[];
  live: boolean;
  resetKey: number;
  typing?: WelcomeTypingProfile;
  className?: string;
};

function linePause(line: string, base: number): number {
  if (line.startsWith("✓")) return base + 220;
  if (line.startsWith("◐")) return base + 340;
  if (line.startsWith("…")) return base + 520;
  if (line.startsWith(">")) return base + 80;
  if (line.startsWith("plan:")) return base + 180;
  return base;
}

function charDelayFor(line: string, profile: WelcomeTypingProfile): number {
  let delay = profile.charDelay;
  if (line.startsWith(">")) delay += 3;
  if (line.startsWith("◐")) delay += 5;
  if (line.startsWith("…")) delay += 8;
  if (line.startsWith("·")) delay += 2;
  if (profile.jitter) {
    delay += Math.floor(Math.random() * profile.jitter) - Math.floor(profile.jitter / 2);
  }
  return Math.max(8, delay);
}

/** Lightweight typewriter — only runs when `live` (one pane at a time on welcome). */
export function WelcomeTypedLines({
  lines,
  live,
  resetKey,
  typing = { charDelay: 14, phaseOffset: 120 },
  className = "",
}: Props) {
  const [armed, setArmed] = useState(typing.phaseOffset === 0);
  const [lineIndex, setLineIndex] = useState(0);
  const [chars, setChars] = useState(0);
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    setArmed(false);
    const id = window.setTimeout(() => setArmed(true), typing.phaseOffset);
    return () => window.clearTimeout(id);
  }, [resetKey, typing.phaseOffset]);

  useEffect(() => {
    setLineIndex(0);
    setChars(0);
    setDone(live ? [] : lines.slice(0, Math.min(4, lines.length)));
  }, [resetKey, live, lines]);

  useEffect(() => {
    if (!live || !armed) return;
    const line = lines[lineIndex];
    if (!line) {
      const id = window.setTimeout(() => {
        setDone([]);
        setLineIndex(0);
        setChars(0);
      }, 2200);
      return () => window.clearTimeout(id);
    }

    if (chars < line.length) {
      const delay = charDelayFor(line, typing);
      const id = window.setTimeout(() => setChars((c) => c + 1), delay);
      return () => window.clearTimeout(id);
    }

    const pause = linePause(line, 280);
    const id = window.setTimeout(() => {
      setDone((prev) => [...prev.slice(-6), line]);
      if (lineIndex < lines.length - 1) {
        setLineIndex((i) => i + 1);
        setChars(0);
      } else {
        setLineIndex(lines.length);
        setChars(0);
      }
    }, pause);
    return () => window.clearTimeout(id);
  }, [live, armed, chars, lineIndex, lines, typing]);

  const current = lines[lineIndex];
  const typingText =
    live && armed && current && lineIndex < lines.length ? current.slice(0, chars) : null;

  return (
    <div className={`vs-welcomePreviewCode${className ? ` ${className}` : ""}`}>
      {done.map((line, i) => (
        <div
          key={`${line}-${i}-${resetKey}`}
          className={`vs-welcomePreviewLine is-settled ${termLineClass(line)}`}
          style={{ animationDelay: `${i * 48}ms` }}
        >
          {line}
        </div>
      ))}
      {typingText != null ? (
        <div className={`vs-welcomePreviewLine ${termLineClass(current)}`}>
          {typingText}
          <span className="vs-welcomeInlineCaret" />
        </div>
      ) : null}
    </div>
  );
}
