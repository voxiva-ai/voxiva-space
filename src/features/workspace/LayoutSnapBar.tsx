import { SNAP_LAYOUTS, type SnapLayoutId } from "@/features/workspace/layout";
import { useSpace } from "@/features/workspace/SpaceContext";
import type { MsgKey } from "@/i18n";

const SNAP_LABEL: Record<SnapLayoutId, MsgKey> = {
  single: "space.snap.single",
  two: "space.snap.two",
  twoWide: "space.snap.twoWide",
  mainStack: "space.snap.mainStack",
  three: "space.snap.three",
  quad: "space.snap.quad",
};

function SnapPreview({ id }: { id: SnapLayoutId }) {
  if (id === "single") {
    return (
      <span className="vs-snapCells is-single">
        <i />
      </span>
    );
  }
  if (id === "two" || id === "twoWide") {
    return (
      <span className={`vs-snapCells is-two${id === "twoWide" ? " is-wide" : ""}`}>
        <i />
        <i />
      </span>
    );
  }
  if (id === "mainStack") {
    return (
      <span className="vs-snapCells is-mainStack">
        <i />
        <i />
        <i />
      </span>
    );
  }
  if (id === "three") {
    return (
      <span className="vs-snapCells is-three">
        <i />
        <i />
        <i />
      </span>
    );
  }
  return (
    <span className="vs-snapCells is-quad">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/** Floating snap picker — drop a pane onto a layout, or click when clickable. */
export function LayoutSnapBar({
  disabled = false,
  floating = false,
  clickable = false,
  onApplied,
}: {
  disabled?: boolean;
  floating?: boolean;
  clickable?: boolean;
  onApplied?: () => void;
}) {
  const { applySnapLayout, t } = useSpace();

  return (
    <div
      className={`vs-snapBar${floating ? " is-floating" : " is-inline"}${clickable ? " is-clickable" : ""}`}
      role="group"
      aria-label={t("space.tipLabel")}
    >
      {floating ? <span className="vs-snapBarHint">{t("space.snapDropHint")}</span> : null}
      <div className="vs-snapOptions">
        {SNAP_LAYOUTS.map((layout) => (
          <button
            key={layout.id}
            type="button"
            className="vs-snapOption"
            data-snap-layout={layout.id}
            disabled={disabled}
            title={t(SNAP_LABEL[layout.id])}
            aria-label={t(SNAP_LABEL[layout.id])}
            onClick={() => {
              if (!clickable || disabled) return;
              void applySnapLayout(layout.id).then(() => onApplied?.());
            }}
          >
            <SnapPreview id={layout.id} />
          </button>
        ))}
      </div>
    </div>
  );
}
