import {
  ArrowRight,
  Brush01,
  Code02,
  CodeBrowser,
  DotsGrid,
  FilePlus02,
  FolderPlus,
  Globe02,
  LayoutLeft,
  LinkExternal01,
  RefreshCw01,
  SearchMd,
  TerminalBrowser,
  TerminalSquare,
  XClose,
} from "@untitledui/icons";

type IconProps = { size?: number; className?: string };
const props = ({ size = 14, className }: IconProps) => ({
  size,
  className,
  "aria-hidden": true,
  focusable: false,
});

export const IconX = (iconProps: IconProps) => <XClose {...props(iconProps)} />;
export const IconRefresh = (iconProps: IconProps) => <RefreshCw01 {...props(iconProps)} />;
export const IconFolderPlus = (iconProps: IconProps) => <FolderPlus {...props(iconProps)} />;
export const IconFilePlus = (iconProps: IconProps) => <FilePlus02 {...props(iconProps)} />;
export const IconGrip = (iconProps: IconProps) => <DotsGrid {...props(iconProps)} />;
export const IconArrowRight = (iconProps: IconProps) => <ArrowRight {...props(iconProps)} />;
export const IconTerminal = (iconProps: IconProps) => <TerminalSquare {...props(iconProps)} />;
/** Add / split console pane */
export const IconConsole = (iconProps: IconProps) => <TerminalBrowser {...props(iconProps)} />;
export const IconCode = (iconProps: IconProps) => <Code02 {...props(iconProps)} />;
export const IconCodeBrowser = (iconProps: IconProps) => <CodeBrowser {...props(iconProps)} />;
export const IconSearch = (iconProps: IconProps) => <SearchMd {...props(iconProps)} />;
/** Inspect element — brush, not click cursor */
export const IconInspect = (iconProps: IconProps) => <Brush01 {...props(iconProps)} />;
export const IconExternalLink = (iconProps: IconProps) => (
  <LinkExternal01 {...props(iconProps)} />
);
/** Sidebar collapse / panel chrome (BridgeMind-style) */
export const IconSidebar = (iconProps: IconProps) => <LayoutLeft {...props(iconProps)} />;
/** Planet / globe for browser */
export const IconBrowser = (iconProps: IconProps) => <Globe02 {...props(iconProps)} />;
