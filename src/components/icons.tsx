import {

  ArrowRight,

  Brush01,

  Code02,

  CodeBrowser,

  DotsGrid,

  FilePlus02,

  FolderPlus,

  Globe02,

  LinkExternal01,

  RefreshCw01,

  SearchMd,

  TerminalBrowser,

  TerminalSquare,

} from "@untitledui/icons";

import type { ReactNode } from "react";



type IconProps = { size?: number; className?: string };

const props = ({ size = 14, className }: IconProps) => ({

  size,

  className,

  "aria-hidden": true,

  focusable: false,

});



function Codicon({

  size = 16,

  className,

  children,

}: IconProps & { children: ReactNode }) {

  return (

    <svg

      width={size}

      height={size}

      viewBox="0 0 16 16"

      fill="currentColor"

      xmlns="http://www.w3.org/2000/svg"

      className={className}

      aria-hidden

      focusable={false}

    >

      {children}

    </svg>

  );

}



/** Geometric X — centered stroke, stays square at 12–16px. */
export const IconX = ({ size = 14, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden
    focusable={false}
  >
    <path
      d="M4.25 4.25 11.75 11.75M11.75 4.25 4.25 11.75"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

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

/** VS Code–style primary sidebar toggle (left strip, no inner cross). */

export const IconSidebar = ({ size = 16, className }: IconProps) => (

  <svg

    width={size}

    height={size}

    viewBox="0 0 16 16"

    fill="none"

    className={className}

    aria-hidden

    focusable={false}

  >

    <path

      d="M3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9A1.5 1.5 0 0 1 3.5 2Z"

      stroke="currentColor"

      strokeWidth="1.25"

    />

    <path

      d="M2.625 3.5c0-.483.392-.875.875-.875H6.25v11.75H3.5a.875.875 0 0 1-.875-.875V3.5Z"

      fill="currentColor"

    />

  </svg>

);

/** Planet / globe for browser */

export const IconBrowser = (iconProps: IconProps) => <Globe02 {...props(iconProps)} />;



/** Official VS Code Codicon: open-preview */

export const IconOpenPreview = ({ size = 16, className }: IconProps) => (

  <Codicon size={size} className={className}>

    <path d="M13.5 1H4.5C3.122 1 2 2.122 2 3.5V6.276C2.319 6.162 2.653 6.089 3 6.05V3.499C3 2.672 3.673 1.999 4.5 1.999H8.5V13.385L9.557 14.442C9.714 14.591 9.831 14.786 9.907 14.999H13.5C14.878 14.999 16 13.877 16 12.499V3.5C16 2.122 14.878 1 13.5 1ZM15 12.5C15 13.327 14.327 14 13.5 14H9.5V2H13.5C14.327 2 15 2.673 15 3.5V12.5ZM6.29 12.59C6.74 12.01 7 11.28 7 10.5C7 8.57 5.43 7 3.5 7C1.57 7 0 8.57 0 10.5C0 12.43 1.57 14 3.5 14C4.28 14 5.01 13.74 5.59 13.29L8.15 15.85C8.24 15.95 8.37 16 8.5 16C8.63 16 8.76 15.95 8.85 15.85C9.05 15.66 9.05 15.34 8.85 15.15L6.29 12.59ZM5.5 12C5.36 12.19 5.19 12.36 5 12.5C4.59 12.81 4.06 13 3.5 13C2.12 13 1 11.88 1 10.5C1 9.12 2.12 8 3.5 8C4.88 8 6 9.12 6 10.5C6 11.06 5.81 11.59 5.5 12Z" />

  </Codicon>

);



/** Official VS Code Codicon: save */

export const IconSave = ({ size = 16, className }: IconProps) => (

  <Codicon size={size} className={className}>

    <path d="M14.414 3.207L12.793 1.586C12.421 1.213 11.905 1 11.379 1H3C1.897 1 1 1.897 1 3V13C1 14.103 1.897 15 3 15H13C14.103 15 15 14.103 15 13V4.621C15 4.095 14.787 3.579 14.414 3.207ZM9 2V3.5C9 3.776 8.776 4 8.5 4H6.5C6.224 4 6 3.776 6 3.5V2H9ZM5 14V9.5C5 9.224 5.224 9 5.5 9H10.5C10.776 9 11 9.224 11 9.5V14H5ZM14 13C14 13.551 13.551 14 13 14H12V9.5C12 8.673 11.327 8 10.5 8H5.5C4.673 8 4 8.673 4 9.5V14H3C2.449 14 2 13.551 2 13V3C2 2.449 2.449 2 3 2H5V3.5C5 4.327 5.673 5 6.5 5H8.5C9.327 5 10 4.327 10 3.5V2H11.379C11.642 2 11.9 2.107 12.086 2.293L13.707 3.914C13.893 4.1 14 4.358 14 4.621V13Z" />

  </Codicon>

);



/** Official VS Code Codicon: save-all */

export const IconSaveAll = ({ size = 16, className }: IconProps) => (

  <Codicon size={size} className={className}>

    <path

      fillRule="evenodd"

      clipRule="evenodd"

      d="M15 6.12V11C15 12.06 14.58 13.08 13.83 13.83C13.08 14.58 12.06 15 11 15H5C4.91 15 4.82 14.99 4.74 14.98C4.66 14.97 4.58 14.96 4.5 14.93C4.32 14.89 4.15 14.82 4 14.73C3.92 14.68 3.85 14.64 3.78 14.58C3.64 14.48 3.52 14.36 3.42 14.22C3.36 14.15 3.32 14.08 3.27 14H11C11.35 14 11.69 13.94 12 13.82C12.42 13.68 12.8 13.44 13.12 13.12C13.68 12.56 14 11.8 14 11V4.3L14.41 4.71C14.79 5.08 15 5.6 15 6.12ZM11 13H3C1.897 13 1 12.103 1 11V3C1 1.897 1.897 1 3 1H9.879C10.405 1 10.921 1.213 11.293 1.586L12.414 2.707C12.787 3.079 13 3.595 13 4.121V11C13 12.103 12.103 13 11 13ZM5.999 3H8V2H5.999V3ZM9 8H5V12H9V8ZM10 8V12H11C11.551 12 12 11.551 12 11V4.121C12 3.858 11.893 3.6 11.707 3.414L10.586 2.293C10.4 2.107 10.142 2 9.879 2H9V3C9 3.551 8.551 4 8 4H6C5.449 4 5 3.551 5 3V2H3C2.449 2 2 2.449 2 3V11C2 11.551 2.449 12 3 12H4V8C4 7.449 4.449 7 5 7H9C9.551 7 10 7.449 10 8Z"

    />

  </Codicon>

);



/** Geometric chevron — right by default; rotate 90° when open. */
export const IconChevronRight = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden
    focusable={false}
  >
    <path
      d="M6 3.75 10.25 8 6 12.25"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

