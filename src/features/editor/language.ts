import type { Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { rust } from "@codemirror/lang-rust";
import { html } from "@codemirror/lang-html";

/** Simple highlighter for .env / dotenv / shell-ish key=value files. */
const envLanguage = StreamLanguage.define({
  name: "env",
  token(stream) {
    if (stream.sol() && stream.match(/[ \t]*/)) {
      // keep going
    }
    if (stream.match(/#.*/)) return "comment";
    if (stream.match(/export\b/)) return "keyword";
    if (stream.match(/[A-Za-z_][\w.-]*/)) {
      if (stream.peek() === "=") return "propertyName";
      return "variableName";
    }
    if (stream.match("=")) return "operator";
    if (stream.match(/"(?:[^\\"]|\\.)*"/) || stream.match(/'(?:[^\\']|\\.)*'/)) return "string";
    if (stream.match(/[^#\s]+/)) return "string";
    stream.next();
    return null;
  },
});

const shellLanguage = StreamLanguage.define({
  name: "shell",
  token(stream) {
    if (stream.match(/#.*/)) return "comment";
    if (stream.match(/"(?:[^\\"]|\\.)*"/) || stream.match(/'(?:[^\\']|\\.)*'/)) return "string";
    if (stream.match(/\b(if|then|else|fi|for|while|do|done|case|esac|function|return|exit|export|source|alias)\b/)) {
      return "keyword";
    }
    if (stream.match(/\$[\w{]?[\w.-]*}?/)) return "variableName";
    if (stream.match(/-[\w-]+/)) return "attributeName";
    if (stream.match(/\d+(\.\d+)?/)) return "number";
    if (stream.match(/[A-Za-z_][\w.-]*/)) return "variableName";
    stream.next();
    return null;
  },
});

export function languageFor(path: string): Extension {
  const base = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const ext = base.includes(".") ? base.split(".").pop()! : base;

  if (ext === "ts" || ext === "tsx") return javascript({ typescript: true, jsx: ext === "tsx" });
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") {
    return javascript({ jsx: ext === "jsx" });
  }
  if (ext === "json" || ext === "jsonc") return json();
  if (ext === "css" || ext === "scss" || ext === "less") return css();
  if (ext === "md" || ext === "mdx") return markdown();
  if (ext === "rs") return rust();
  if (ext === "html" || ext === "htm" || ext === "svg") return html();
  if (
    ext === "env" ||
    base.startsWith(".env") ||
    ext === "dotenv" ||
    ext === "ini" ||
    ext === "properties" ||
    ext === "toml"
  ) {
    return envLanguage;
  }
  if (ext === "sh" || ext === "bash" || ext === "zsh" || ext === "ps1" || ext === "cmd") {
    return shellLanguage;
  }
  return [];
}
