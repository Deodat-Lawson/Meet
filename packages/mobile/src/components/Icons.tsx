import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

interface IconProps {
  size?: number;
  color?: string;
}

/** Shares path data with the web icon set so both apps read identically. */
const stroke = (color: string) => ({
  stroke: color,
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

export const MicIcon = ({ size = 22, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path {...stroke(color)} d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z" />
    <Path {...stroke(color)} d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
  </Svg>
);

export const MicOffIcon = ({ size = 22, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path {...stroke(color)} d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
    <Path {...stroke(color)} d="M19 10v2a7 7 0 0 1-.11 1.23M12 19v3M5 5l14 14M5 10v2a7 7 0 0 0 10.71 5.96" />
  </Svg>
);

export const VideoIcon = ({ size = 22, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect {...stroke(color)} x={2} y={6} width={14} height={12} rx={2.5} />
    <Path {...stroke(color)} d="m16 11 5-3v8l-5-3z" />
  </Svg>
);

export const VideoOffIcon = ({ size = 22, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path {...stroke(color)} d="M10.7 6H13.5a2.5 2.5 0 0 1 2.5 2.5v2.3M16 15.5V16a2 2 0 0 1-2 2H4.5A2.5 2.5 0 0 1 2 15.5v-7A2.5 2.5 0 0 1 4.5 6" />
    <Path {...stroke(color)} d="m16 11 5-3v8l-3.5-2.1M4 4l16 16" />
  </Svg>
);

export const ScreenShareIcon = ({ size = 22, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect {...stroke(color)} x={2} y={4} width={20} height={13} rx={2} />
    <Path {...stroke(color)} d="M8 21h8M12 17v4M12 13V7.5M9.5 10 12 7.5 14.5 10" />
  </Svg>
);

export const ScreenShareOffIcon = ({ size = 22, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path {...stroke(color)} d="M22 15V6a2 2 0 0 0-2-2H8M2 8v7a2 2 0 0 0 2 2h13" />
    <Path {...stroke(color)} d="M8 21h8M12 17v4M3 3l18 18" />
  </Svg>
);

export const UsersIcon = ({ size = 22, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path {...stroke(color)} d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
    <Circle {...stroke(color)} cx={9} cy={7} r={3.5} />
    <Path {...stroke(color)} d="M22 20v-1.5a4 4 0 0 0-3-3.87M16.5 3.6a4 4 0 0 1 0 7.75" />
  </Svg>
);

export const ChatIcon = ({ size = 22, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path {...stroke(color)} d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 21l1.9-4.6A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z" />
  </Svg>
);

export const HandIcon = ({ size = 22, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path {...stroke(color)} d="M18 11V6a1.6 1.6 0 0 0-3.2 0M14.8 10V4.6a1.6 1.6 0 1 0-3.2 0V10" />
    <Path {...stroke(color)} d="M11.6 10.5V6.4a1.6 1.6 0 1 0-3.2 0v7.4M8.4 12.4 7 11a1.7 1.7 0 0 0-2.4 2.4L8 18a6 6 0 0 0 5 3h1a4 4 0 0 0 4-4v-6" />
  </Svg>
);

export const PhoneOffIcon = ({ size = 22, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      {...stroke(color)}
      d="M10.7 13.3a13.5 13.5 0 0 1-3-4.4l2-1.7a1.6 1.6 0 0 0 .35-1.9L8.5 2.9A1.6 1.6 0 0 0 6.8 2L3.4 2.6A1.7 1.7 0 0 0 2 4.4 19.5 19.5 0 0 0 19.6 22a1.7 1.7 0 0 0 1.8-1.4l.6-3.4a1.6 1.6 0 0 0-.9-1.7l-2.4-1.5a1.6 1.6 0 0 0-1.9.34l-1.7 2"
    />
    <Path {...stroke(color)} d="M2 2l20 20" />
  </Svg>
);

export const CameraSwitchIcon = ({ size = 22, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path {...stroke(color)} d="M20 7h-3l-1.5-2h-7L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z" />
    <Path {...stroke(color)} d="M9.5 13.5a2.5 2.5 0 0 1 4.3-1.7M14.5 14.5a2.5 2.5 0 0 1-4.3 1.7M14 10.5V12h-1.5M10 17.5V16h1.5" />
  </Svg>
);

export const SpeakerIcon = ({ size = 22, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path {...stroke(color)} d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
    <Path {...stroke(color)} d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  </Svg>
);

export const SpeakerOffIcon = ({ size = 22, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path {...stroke(color)} d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
    <Path {...stroke(color)} d="m16 9.5 5 5M21 9.5l-5 5" />
  </Svg>
);

export const CloseIcon = ({ size = 20, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path {...stroke(color)} d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

/** Collapses the meeting: a window shrinking into the corner it lands in. */
export const MinimizeIcon = ({ size = 20, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect {...stroke(color)} x={3} y={4} width={18} height={16} rx={2.5} />
    <Rect {...stroke(color)} x={12} y={13} width={7} height={5} rx={1.5} />
  </Svg>
);

export const SendIcon = ({ size = 20, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path {...stroke(color)} d="m22 2-7 20-4-9-9-4Z" />
  </Svg>
);

export const MoreIcon = ({ size = 20, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={5} r={1.5} fill={color} />
    <Circle cx={12} cy={12} r={1.5} fill={color} />
    <Circle cx={12} cy={19} r={1.5} fill={color} />
  </Svg>
);

export const SmileIcon = ({ size = 22, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle {...stroke(color)} cx={12} cy={12} r={9.2} />
    <Path {...stroke(color)} d="M8 14.2a5 5 0 0 0 8 0M9 9.5h.01M15 9.5h.01" />
  </Svg>
);

export const RecordIcon = ({ size = 22, color = colors.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle {...stroke(color)} cx={12} cy={12} r={9.2} />
    <Circle cx={12} cy={12} r={4} fill={color} />
  </Svg>
);

/** Brand mark: a padlock with a camera lens set into its body. */
export const LogoIcon = ({ size = 34 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 100 100">
    <Rect width={100} height={100} rx={22} fill={colors.brandDeep} />
    <Rect x={26} y={46} width={48} height={35} rx={10} fill="#fff" />
    <Path d="M36 46 V37 a14 14 0 0 1 28 0 v9" stroke="#fff" strokeWidth={8.5} fill="none" strokeLinecap="round" />
    <Circle cx={47} cy={62} r={8} fill={colors.brandDeep} />
    <Path d="M58 57 l9 -5.5 v20 l-9 -5.5 z" fill={colors.brandDeep} />
  </Svg>
);
