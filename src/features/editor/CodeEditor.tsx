import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { useMemo } from "react";
import { languageFor } from "./language";
import { editorTheme } from "./theme";

export function CodeEditor({
  path,
  value,
  dark,
  onChange,
}: {
  path: string;
  value: string;
  dark: boolean;
  onChange: (value: string) => void;
}) {
  const extensions = useMemo(
    () => [languageFor(path), ...editorTheme(dark), EditorView.lineWrapping],
    [path, dark],
  );

  return (
    <CodeMirror
      className="vs-codeMirror"
      height="100%"
      value={value}
      theme="none"
      extensions={extensions}
      onChange={onChange}
      basicSetup={{
        foldGutter: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        bracketMatching: true,
        lineNumbers: true,
        // ponytail: full autocomplete is heavy in big files; add when needed
        autocompletion: false,
      }}
    />
  );
}
