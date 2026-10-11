import {
  ArrowRight,
  Bell,
  Brush,
  ChevronLeft,
  ChevronRight,
  Code2,
  CodeXml,
  ExternalLink,
  FilePlus2,
  FolderPlus,
  Globe,
  Grip,
  History,
  LayoutDashboard,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  SaveAll,
  Search,
  Settings,
  SquareArrowOutUpRight,
  SquareTerminal,
  X,
} from "lucide-react";

type IconProps = { size?: number; className?: string; "aria-hidden"?: boolean };

const iconProps = ({ size = 16, className }: IconProps) => ({
  size,
  className,
  "aria-hidden": true as const,
  focusable: false as const,
});

export const IconX = (p: IconProps) => <X {...iconProps(p)} />;
export const IconRefresh = (p: IconProps) => <RefreshCw {...iconProps(p)} />;
export const IconFolderPlus = (p: IconProps) => <FolderPlus {...iconProps(p)} />;
export const IconFilePlus = (p: IconProps) => <FilePlus2 {...iconProps(p)} />;
export const IconGrip = (p: IconProps) => <Grip {...iconProps(p)} />;
export const IconArrowRight = (p: IconProps) => <ArrowRight {...iconProps(p)} />;
export const IconTerminal = (p: IconProps) => <SquareTerminal {...iconProps(p)} />;
export const IconConsole = IconTerminal;
export const IconCode = (p: IconProps) => <Code2 {...iconProps(p)} />;
export const IconCodeBrowser = (p: IconProps) => <CodeXml {...iconProps(p)} />;
export const IconSearch = (p: IconProps) => <Search {...iconProps(p)} />;
export const IconInspect = (p: IconProps) => <Brush {...iconProps(p)} />;
export const IconExternalLink = (p: IconProps) => <ExternalLink {...iconProps(p)} />;
export const IconSidebar = (p: IconProps) => <PanelLeft {...iconProps(p)} />;
export const IconLayout = (p: IconProps) => <LayoutDashboard {...iconProps(p)} />;
export const IconMore = (p: IconProps) => <MoreHorizontal {...iconProps(p)} />;
export const IconBrowser = (p: IconProps) => <Globe {...iconProps(p)} />;
export const IconOpenPreview = (p: IconProps) => <SquareArrowOutUpRight {...iconProps(p)} />;
export const IconSave = (p: IconProps) => <Save {...iconProps(p)} />;
export const IconSaveAll = (p: IconProps) => <SaveAll {...iconProps(p)} />;
export const IconHistory = (p: IconProps) => <History {...iconProps(p)} />;
export const IconSettings = (p: IconProps) => <Settings {...iconProps(p)} />;
export const IconBell = (p: IconProps) => <Bell {...iconProps(p)} />;
export const IconPlusStroke = (p: IconProps) => <Plus {...iconProps(p)} />;
export const IconAssistPanel = (p: IconProps) => <PanelRight {...iconProps(p)} />;
export const IconChevronRight = (p: IconProps) => <ChevronRight {...iconProps(p)} />;
export const IconChevronLeft = (p: IconProps) => <ChevronLeft {...iconProps(p)} />;
export const IconReopen = (p: IconProps) => <RotateCcw {...iconProps(p)} />;
