import { forwardRef, useEffect, useRef, useState, type ComponentProps } from "react";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor";
import { EditorMinimap } from "./EditorMinimap";
import { loadMinimap, subscribeMinimap } from "./minimapPrefs";

type Props = ComponentProps<typeof CodeEditor>;

export const CodeEditorWithMinimap = forwardRef<CodeEditorHandle, Props>(
  function CodeEditorWithMinimap(props, ref) {
    const inner = useRef<CodeEditorHandle>(null);
    const [on, setOn] = useState(loadMinimap);

    useEffect(() => subscribeMinimap(setOn), []);

    return (
      <div className={`vs-editorWithMap${on ? " has-map" : ""}`}>
        <CodeEditor
          ref={(node) => {
            inner.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
          }}
          {...props}
        />
        {on ? <EditorMinimap editorRef={inner} value={props.value} dark={props.dark} /> : null}
      </div>
    );
  },
);
