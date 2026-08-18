import {
  forwardRef,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { renderMarkdown } from "./markdown";

export type MarkdownPreviewHandle = {
  scrollRatio: (ratio: number) => void;
  getScrollRatio: () => number;
  onScroll: (cb: ((ratio: number) => void) | null) => void;
};

export const MarkdownPreview = forwardRef<
  MarkdownPreviewHandle,
  { content: string }
>(function MarkdownPreview({ content }, ref) {
  const deferred = useDeferredValue(content);
  const html = useMemo(() => renderMarkdown(deferred), [deferred]);
  const stale = deferred !== content;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef(false);
  const scrollCbRef = useRef<((ratio: number) => void) | null>(null);
  const rafRef = useRef(0);

  useImperativeHandle(ref, () => ({
    getScrollRatio() {
      const el = scrollerRef.current;
      if (!el) return 0;
      const max = el.scrollHeight - el.clientHeight;
      return max <= 0 ? 0 : el.scrollTop / max;
    },
    scrollRatio(ratio: number) {
      const el = scrollerRef.current;
      if (!el) return;
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return;
      const next = Math.max(0, Math.min(1, ratio)) * max;
      if (Math.abs(el.scrollTop - next) < 0.5) return;
      lockRef.current = true;
      el.scrollTop = next;
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
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (lockRef.current) return;
      const cb = scrollCbRef.current;
      if (!cb) return;
      const max = el.scrollHeight - el.clientHeight;
      cb(max <= 0 ? 0 : el.scrollTop / max);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={scrollerRef}
      className={`vs-mdPreviewScroll${stale ? " is-stale" : ""}`}
      aria-live="polite"
      aria-busy={stale}
    >
      <article className="vs-mdPreview" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
});
