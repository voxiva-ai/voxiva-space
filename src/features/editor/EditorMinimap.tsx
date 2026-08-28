import { useEffect, useRef, type RefObject } from "react";
import type { CodeEditorHandle } from "./CodeEditor";

type Props = {
  editorRef: RefObject<CodeEditorHandle | null>;
  value: string;
  dark: boolean;
};

/** VS Code-style document overview — click or drag to scroll. */
export function EditorMinimap({ editorRef, value, dark }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const ratioRef = useRef(0);
  const dragRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const draw = (ratio: number) => {
      ratioRef.current = ratio;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = wrap.clientWidth;
      const height = wrap.clientHeight;
      if (width < 8 || height < 8) return;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const lines = value.split(/\n/);
      const lineH = Math.max(0.7, height / Math.max(lines.length, 1));
      const ink = dark ? "rgba(220,230,240,0.38)" : "rgba(20,24,32,0.32)";
      const mute = dark ? "rgba(220,230,240,0.16)" : "rgba(20,24,32,0.14)";
      ctx.fillStyle = ink;
      const maxW = width - 4;
      for (let i = 0; i < lines.length; i += 1) {
        const raw = lines[i] ?? "";
        const trimmed = raw.trimStart();
        const indent = Math.min(12, raw.length - trimmed.length);
        const len = Math.min(maxW, 2 + trimmed.length * 0.55);
        ctx.fillStyle = trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*")
          ? mute
          : ink;
        ctx.fillRect(2 + indent * 0.7, i * lineH, len, Math.max(0.6, lineH * 0.72));
      }

      const vis = Math.min(1, height / Math.max(height, lines.length * 2.2));
      const boxH = Math.max(18, height * vis);
      const maxTop = Math.max(0, height - boxH);
      const top = ratio * maxTop;
      ctx.fillStyle = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
      ctx.fillRect(0, top, width, boxH);
      ctx.strokeStyle = dark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.2)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, top + 0.5, width - 1, boxH - 1);
    };

    const handle = editorRef.current;
    handle?.onScroll((r) => draw(r));
    draw(handle?.getScrollRatio() ?? 0);

    const ro = new ResizeObserver(() => draw(ratioRef.current));
    ro.observe(wrap);
    return () => {
      handle?.onScroll(null);
      ro.disconnect();
    };
  }, [dark, editorRef, value]);

  const seek = (clientY: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
    editorRef.current?.scrollRatio(ratio);
  };

  return (
    <div
      ref={wrapRef}
      className="vs-minimap"
      aria-hidden
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        dragRef.current = true;
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        seek(event.clientY);
      }}
      onPointerMove={(event) => {
        if (!dragRef.current) return;
        seek(event.clientY);
      }}
      onPointerUp={() => {
        dragRef.current = false;
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
