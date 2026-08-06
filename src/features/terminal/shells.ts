export const TERMINAL_OPTIONS = [
  { value: "", label: "Auto", hint: "PowerShell → pwsh → cmd" },
  { value: "powershell.exe", label: "Windows PowerShell", hint: "Built into Windows" },
  { value: "pwsh.exe", label: "PowerShell 7", hint: "Modern PowerShell" },
  { value: "cmd.exe", label: "Command Prompt", hint: "Classic cmd" },
] as const;
