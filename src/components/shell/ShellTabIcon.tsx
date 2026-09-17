type Props = { shell?: string | null; size?: number; className?: string };

type ShellKind = "pwsh" | "cmd" | "bash" | "zsh" | "fish" | "shell";

function detectShell(shell?: string | null): ShellKind {
  const label = (shell || "").toLowerCase();
  if (label.includes("pwsh") || label.includes("powershell")) return "pwsh";
  if (label.includes("cmd")) return "cmd";
  if (label.includes("bash")) return "bash";
  if (label.includes("zsh")) return "zsh";
  if (label.includes("fish")) return "fish";
  return "shell";
}

/**
 * Outline shell glyph for pane tabs — stroke only, inherits tab color.
 * Agent brand logos stay in Vault only.
 */
export function ShellTabIcon({ shell, size = 12, className }: Props) {
  const kind = detectShell(shell);
  const title =
    kind === "pwsh"
      ? "PowerShell"
      : kind === "cmd"
        ? "CMD"
        : kind === "bash"
          ? "bash"
          : kind === "zsh"
            ? "zsh"
            : kind === "fish"
              ? "fish"
              : "Shell";

  return (
    <span
      className={`vs-shellTabIcon is-${kind}${className ? ` ${className}` : ""}`}
      title={title}
      aria-hidden
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 16 16" width={size} height={size} fill="none">
        <rect
          x="1.25"
          y="1.25"
          width="13.5"
          height="13.5"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.25"
          opacity="0.55"
        />
        <path
          d="M4.4 5.25 7.55 8 4.4 10.75"
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8.35 11H12" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
      </svg>
    </span>
  );
}
