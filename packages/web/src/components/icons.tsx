/** Inline SVG icon set. Inline keeps the app self-contained with no icon font. */
interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const MicIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
  </svg>
);

export const MicOffIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
    <path d="M19 10v2a7 7 0 0 1-.11 1.23M12 19v3M5 5l14 14M5 10v2a7 7 0 0 0 10.71 5.96" />
  </svg>
);

export const VideoIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="2" y="6" width="14" height="12" rx="2.5" />
    <path d="m16 11 5-3v8l-5-3z" />
  </svg>
);

export const VideoOffIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M10.7 6H13.5a2.5 2.5 0 0 1 2.5 2.5v2.3M16 15.5V16a2 2 0 0 1-2 2H4.5A2.5 2.5 0 0 1 2 15.5v-7A2.5 2.5 0 0 1 4.5 6" />
    <path d="m16 11 5-3v8l-3.5-2.1M4 4l16 16" />
  </svg>
);

export const ScreenShareIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="2" y="4" width="20" height="13" rx="2" />
    <path d="M8 21h8M12 17v4M12 13V7.5M9.5 10 12 7.5 14.5 10" />
  </svg>
);

export const ScreenShareOffIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M22 15V6a2 2 0 0 0-2-2H8M2 8v7a2 2 0 0 0 2 2h13" />
    <path d="M8 21h8M12 17v4M3 3l18 18" />
  </svg>
);

export const UsersIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
    <circle cx="9" cy="7" r="3.5" />
    <path d="M22 20v-1.5a4 4 0 0 0-3-3.87M16.5 3.6a4 4 0 0 1 0 7.75" />
  </svg>
);

export const ChatIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 21l1.9-4.6A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z" />
  </svg>
);

export const HandIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M18 11V6a1.6 1.6 0 0 0-3.2 0M14.8 10V4.6a1.6 1.6 0 1 0-3.2 0V10" />
    <path d="M11.6 10.5V6.4a1.6 1.6 0 1 0-3.2 0v7.4M8.4 12.4 7 11a1.7 1.7 0 0 0-2.4 2.4L8 18a6 6 0 0 0 5 3h1a4 4 0 0 0 4-4v-6" />
  </svg>
);

export const SmileIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="9.2" />
    <path d="M8 14.2a5 5 0 0 0 8 0M9 9.5h.01M15 9.5h.01" />
  </svg>
);

export const SettingsIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 9 4.6h.08A1.6 1.6 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 19.4 9v.08a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </svg>
);

export const PhoneOffIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M10.7 13.3a13.5 13.5 0 0 1-3-4.4l2-1.7a1.6 1.6 0 0 0 .35-1.9L8.5 2.9A1.6 1.6 0 0 0 6.8 2L3.4 2.6A1.7 1.7 0 0 0 2 4.4 19.5 19.5 0 0 0 19.6 22a1.7 1.7 0 0 0 1.8-1.4l.6-3.4a1.6 1.6 0 0 0-.9-1.7l-2.4-1.5a1.6 1.6 0 0 0-1.9.34l-1.7 2" />
    <path d="M2 2l20 20" />
  </svg>
);

export const CloseIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const SendIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="m22 2-7 20-4-9-9-4Z" />
  </svg>
);

export const PinIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M15 3v6l3.5 4H5.5L9 9V3M12 13v8M9 3h6" />
  </svg>
);

export const GridIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </svg>
);

export const SpeakerViewIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="4" width="13" height="16" rx="1.8" />
    <rect x="18" y="4" width="3" height="5" rx="1" />
    <rect x="18" y="11" width="3" height="5" rx="1" />
  </svg>
);

export const RecordIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="9.2" />
    <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
  </svg>
);

export const MoreIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="5" r="1.4" fill="currentColor" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    <circle cx="12" cy="19" r="1.4" fill="currentColor" />
  </svg>
);

export const CopyIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export const CheckIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="m20 6-11 11-5-5" />
  </svg>
);

export const LockIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

export const CameraSwitchIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M20 7h-3l-1.5-2h-7L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z" />
    <path d="M9.5 13.5a2.5 2.5 0 0 1 4.3-1.7M14.5 14.5a2.5 2.5 0 0 1-4.3 1.7M14 10.5V12h-1.5M10 17.5V16h1.5" />
  </svg>
);
