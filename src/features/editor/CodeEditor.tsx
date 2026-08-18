import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { foldGutter } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { VOXIVA_TEXT_MIME } from "@/features/terminal/drop";
import { languageFor } from "./language";
import { editorTheme } from "./theme";

/** Crisp SVG fold markers — CodeMirror's default ⌄/› glyphs look crooked. */
function foldMarker(open: boolean) {
  const el = document.createElement("span");
  el.className = `vs-foldMark${open ? " is-open" : ""}`;
  el.innerHTML =
    '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.75 10.25 8 6 12.25" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return el;
}

const foldMarkers = foldGutter({ markerDOM: foldMarker });

const selectionDrag = EditorView.domEventHandlers({
  dragstart(event, view) {
    const sel = view.state.selection.main;
    if (sel.empty) return false;
    const text = view.state.sliceDoc(sel.from, sel.to);
    if (!text) return false;
    const dt = event.dataTransfer;
    if (!dt) return false;
    dt.setData("text/plain", text);
    dt.setData(VOXIVA_TEXT_MIME, text);
    dt.effectAllowed = "copyMove";
    return true;
  },
});

export type CodeEditorHandle = {
  scrollRatio: (ratio: number) => void;
  getScrollRatio: () => number;
  onScroll: (cb: ((ratio: number) => void) | null) => void;
};

export const CodeEditor = forwardRef<
  CodeEditorHandle,
  {
    path: string;
    value: string;
    dark: boolean;
    onChange: (value: string) => void;
  }
>(function CodeEditor({ path, value, dark, onChange }, ref) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const lockRef = useRef(false);
  const scrollCbRef = useRef<((ratio: number) => void) | null>(null);
  const rafRef = useRef(0);

  const extensions = useMemo(
    () => [
      languageFor(path),
      ...editorTheme(dark),
      foldMarkers,
      EditorView.lineWrapping,
      selectionDrag,
    ],
    [path, dark],
  );

  useImperativeHandle(ref, () => ({
    getScrollRatio() {
      const scroller = cmRef.current?.view?.scrollDOM;
      if (!scroller) return 0;
      const max = scroller.scrollHeight - scroller.clientHeight;
      return max <= 0 ? 0 : scroller.scrollTop / max;
    },
    scrollRatio(ratio: number) {
      const scroller = cmRef.current?.view?.scrollDOM;
      if (!scroller) return;
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (max <= 0) return;
      const next = Math.max(0, Math.min(1, ratio)) * max;
      if (Math.abs(scroller.scrollTop - next) < 0.5) return;
      lockRef.current = true;
      scroller.scrollTop = next;
      // Keep lock through the scroll event that we just caused.
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => {
          lockRef.current = false;
        });
      });
    },
    onScroll(cb) {
      scrollCbRef.current = cb;
    },
  }));

  useEffect(() => {
    const view = cmRef.current?.view;
    if (!view) return;
    const scroller = view.scrollDOM;
    const onScroll = () => {
      if (lockRef.current) return;
      const cb = scrollCbRef.current;
      if (!cb) return;
      const max = scroller.scrollHeight - scroller.clientHeight;
      cb(max <= 0 ? 0 : scroller.scrollTop / max);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [path, dark]);

  return (
    <CodeMirror
      ref={cmRef}
      className="vs-codeMirror"
      height="100%"
      value={value}
      theme="none"
      extensions={extensions}
      onChange={onChange}
      basicSetup={{
        foldGutter: false,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        bracketMatching: true,
        lineNumbers: true,
        // ponytail: full autocomplete is heavy in big files; add when needed
        autocompletion: false,
      }}
    />
  );
});
