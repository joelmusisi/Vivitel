import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const BaseIcon = ({ children, ...props }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
    {children}
  </svg>
);

export const CompassIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="8" />
    <path d="m15 9-2 5-5 2 2-5 5-2z" />
  </BaseIcon>
);

export const DownloadIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M12 4v10" />
    <path d="m8 10 4 4 4-4" />
    <path d="M5 20h14" />
  </BaseIcon>
);

export const EditIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4z" />
    <path d="m13.5 6.5 4 4" />
  </BaseIcon>
);

export const PinsIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11z" />
    <circle cx="12" cy="10" r="2" />
  </BaseIcon>
);

export const QueryIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m16 16 4 4" />
    <path d="M9.5 9a2.2 2.2 0 0 1 4.2 1c0 1.8-1.8 2-1.8 3.4" />
    <path d="M12 16h.01" />
  </BaseIcon>
);

export const ReportIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M7 3h7l3 3v15H7V3z" />
    <path d="M14 3v4h4" />
    <path d="M9 12h6M9 16h6" />
  </BaseIcon>
);

export const SettingsIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.7a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.7a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" />
  </BaseIcon>
);

export const TimelineIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M5 5v14" />
    <path d="M5 8h10l3-3" />
    <path d="M5 16h8l3 3" />
    <circle cx="5" cy="8" r="2" />
    <circle cx="5" cy="16" r="2" />
  </BaseIcon>
);
