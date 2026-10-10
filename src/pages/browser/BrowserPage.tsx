import { NativeBrowser } from "@/features/browser/NativeBrowser";
import { useSpace, useView } from "@/features/workspace/SpaceContext";

export function BrowserPage() {
  const { browserUrl, setBrowserUrl } = useSpace();
  const { view } = useView();
  return (
    <NativeBrowser
      active={view === "browser"}
      instanceId="page"
      url={browserUrl}
      onUrlChange={setBrowserUrl}
    />
  );
}
