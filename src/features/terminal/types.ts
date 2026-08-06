export type TerminalCreated = {
  id: string;
  title: string;
  shell: string;
  cwd: string | null;
};

export type TerminalOutputEvent = {
  id: string;
  data: string;
};

export type TerminalExitEvent = {
  id: string;
  code: number | null;
  message: string;
};
