import { NativeBrowser } from "@/features/browser/NativeBrowser";
import { useSpace } from "@/features/workspace/SpaceContext";

export function BrowserPage() {
  const { browserUrl, setBrowserUrl } = useSpace();
  return (
    <NativeBrowser
      instanceId="page"
      url={browserUrl}
      onUrlChange={setBrowserUrl}
    />
  );
}
