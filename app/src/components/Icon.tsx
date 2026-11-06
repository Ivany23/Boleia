import React from 'react';
import Svg, { Circle, Path, Line, Polyline, Rect } from 'react-native-svg';

export type IconName =
  | 'person' | 'car' | 'search' | 'location' | 'flag' | 'moon'
  | 'sun' | 'clock' | 'menu' | 'my-location' | 'compass' | 'expand'
  | 'navigate' | 'note' | 'map' | 'pin' | 'swap' | 'logout'
  | 'close' | 'check' | 'star' | 'star-outline' | 'alert'
  | 'motorcycle' | 'back' | 'ban' | 'sad' | 'celebrate'
  | 'fuel' | 'traffic' | 'bolt' | 'pencil';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

const commonProps = (color: string, sw: number) => ({
  stroke: color,
  strokeWidth: sw,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none' as const,
});

export function Icon({ name, size = 20, color = '#3A4740', strokeWidth = 1.8 }: Props) {
  const cp = commonProps(color, strokeWidth);

  const renderIcon = () => {
    switch (name) {
      /* ── person ─────────────────────────────────────── */
      case 'person':
        return (
          <>
            <Circle cx={12} cy={7} r={3.5} {...cp} />
            <Path d="M5.5 21a6.5 6.5 0 0 1 13 0" {...cp} />
          </>
        );

      /* ── car ────────────────────────────────────────── */
      case 'car':
        return (
          <>
            <Path d="M5 17h14v-4l-2-5H7L5 13v4z" {...cp} />
            <Circle cx={8} cy={17} r={1.5} {...cp} />
            <Circle cx={16} cy={17} r={1.5} {...cp} />
            <Line x1={5} y1={13} x2={19} y2={13} {...cp} />
          </>
        );

      /* ── search ─────────────────────────────────────── */
      case 'search':
        return (
          <>
            <Circle cx={11} cy={11} r={6} {...cp} />
            <Line x1={16.25} y1={16.25} x2={20} y2={20} {...cp} />
          </>
        );

      /* ── location (teardrop pin with inner circle) ──── */
      case 'location':
        return (
          <>
            <Path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" {...cp} />
            <Circle cx={12} cy={9} r={2.5} {...cp} />
          </>
        );

      /* ── flag ───────────────────────────────────────── */
      case 'flag':
        return (
          <>
            <Line x1={5} y1={4} x2={5} y2={21} {...cp} />
            <Path d="M5 4h11l-3 4 3 4H5" {...cp} />
          </>
        );

      /* ── moon ───────────────────────────────────────── */
      case 'moon':
        return (
          <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" {...cp} />
        );

      /* ── sun ────────────────────────────────────────── */
      case 'sun':
        return (
          <>
            <Circle cx={12} cy={12} r={4} {...cp} />
            <Line x1={12} y1={2} x2={12} y2={4.5} {...cp} />
            <Line x1={12} y1={19.5} x2={12} y2={22} {...cp} />
            <Line x1={4.22} y1={4.22} x2={5.99} y2={5.99} {...cp} />
            <Line x1={18.01} y1={18.01} x2={19.78} y2={19.78} {...cp} />
            <Line x1={2} y1={12} x2={4.5} y2={12} {...cp} />
            <Line x1={19.5} y1={12} x2={22} y2={12} {...cp} />
            <Line x1={4.22} y1={19.78} x2={5.99} y2={18.01} {...cp} />
            <Line x1={18.01} y1={5.99} x2={19.78} y2={4.22} {...cp} />
          </>
        );

      /* ── clock ──────────────────────────────────────── */
      case 'clock':
        return (
          <>
            <Circle cx={12} cy={12} r={9} {...cp} />
            <Polyline points="12 6 12 12 16 14" {...cp} />
          </>
        );

      /* ── menu (hamburger) ───────────────────────────── */
      case 'menu':
        return (
          <>
            <Line x1={4} y1={6} x2={20} y2={6} {...cp} />
            <Line x1={4} y1={12} x2={20} y2={12} {...cp} />
            <Line x1={4} y1={18} x2={20} y2={18} {...cp} />
          </>
        );

      /* ── my-location (crosshair) ────────────────────── */
      case 'my-location':
        return (
          <>
            <Circle cx={12} cy={12} r={4} {...cp} />
            <Circle cx={12} cy={12} r={8} {...cp} />
            <Line x1={12} y1={2} x2={12} y2={4} {...cp} />
            <Line x1={12} y1={20} x2={12} y2={22} {...cp} />
            <Line x1={2} y1={12} x2={4} y2={12} {...cp} />
            <Line x1={20} y1={12} x2={22} y2={12} {...cp} />
          </>
        );

      /* ── compass ────────────────────────────────────── */
      case 'compass':
        return (
          <>
            <Circle cx={12} cy={12} r={9} {...cp} />
            <Path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36z" {...cp} />
          </>
        );

      /* ── expand ─────────────────────────────────────── */
      case 'expand':
        return (
          <>
            <Polyline points="15 3 21 3 21 9" {...cp} />
            <Polyline points="9 21 3 21 3 15" {...cp} />
            <Line x1={21} y1={3} x2={14} y2={10} {...cp} />
            <Line x1={3} y1={21} x2={10} y2={14} {...cp} />
          </>
        );

      /* ── navigate (direction arrow) ─────────────────── */
      case 'navigate':
        return (
          <Path d="M3 11l19-9-9 19-2-8-8-2z" {...cp} />
        );

      /* ── note ───────────────────────────────────────── */
      case 'note':
        return (
          <>
            <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" {...cp} />
            <Polyline points="14 2 14 8 20 8" {...cp} />
            <Line x1={8} y1={13} x2={16} y2={13} {...cp} />
            <Line x1={8} y1={17} x2={13} y2={17} {...cp} />
          </>
        );

      /* ── map ────────────────────────────────────────── */
      case 'map':
        return (
          <>
            <Path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" {...cp} />
            <Line x1={8} y1={2} x2={8} y2={18} {...cp} />
            <Line x1={16} y1={6} x2={16} y2={22} {...cp} />
          </>
        );

      /* ── pin ────────────────────────────────────────── */
      case 'pin':
        return (
          <>
            <Path d="M12 2C9.24 2 7 4.24 7 7c0 4.5 5 11 5 11s5-6.5 5-11c0-2.76-2.24-5-5-5z" {...cp} />
            <Circle cx={12} cy={7} r={1.5} {...cp} />
          </>
        );

      /* ── swap ───────────────────────────────────────── */
      case 'swap':
        return (
          <>
            <Polyline points="17 1 21 5 17 9" {...cp} />
            <Line x1={3} y1={5} x2={21} y2={5} {...cp} />
            <Polyline points="7 23 3 19 7 15" {...cp} />
            <Line x1={21} y1={19} x2={3} y2={19} {...cp} />
          </>
        );

      /* ── logout ─────────────────────────────────────── */
      case 'logout':
        return (
          <>
            <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" {...cp} />
            <Polyline points="16 17 21 12 16 7" {...cp} />
            <Line x1={21} y1={12} x2={9} y2={12} {...cp} />
          </>
        );

      /* ── close (X) ──────────────────────────────────── */
      case 'close':
        return (
          <>
            <Line x1={18} y1={6} x2={6} y2={18} {...cp} />
            <Line x1={6} y1={6} x2={18} y2={18} {...cp} />
          </>
        );

      /* ── check ──────────────────────────────────────── */
      case 'check':
        return (
          <Polyline points="4 12 9 17 20 6" {...cp} />
        );

      /* ── star (filled) ──────────────────────────────── */
      case 'star':
        return (
          <Path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={color}
          />
        );

      /* ── star-outline ───────────────────────────────── */
      case 'star-outline':
        return (
          <Path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"
            {...cp}
          />
        );

      /* ── alert ──────────────────────────────────────── */
      case 'alert':
        return (
          <>
            <Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" {...cp} />
            <Line x1={12} y1={9} x2={12} y2={13} {...cp} />
            <Circle cx={12} cy={16.5} r={0.5} stroke={color} strokeWidth={strokeWidth} fill={color} />
          </>
        );

      /* ── motorcycle ─────────────────────────────────── */
      case 'motorcycle':
        return (
          <>
            <Circle cx={5.5} cy={17} r={3} {...cp} />
            <Circle cx={18.5} cy={17} r={3} {...cp} />
            <Path d="M5.5 17l3-7h4l3.5 3H19" {...cp} />
            <Path d="M12.5 10l1.5-3h3" {...cp} />
            <Line x1={8.5} y1={10} x2={14} y2={10} {...cp} />
          </>
        );

      /* ── back (left chevron) ────────────────────────── */
      case 'back':
        return (
          <Polyline points="15 18 9 12 15 6" {...cp} />
        );

      /* ── ban ────────────────────────────────────────── */
      case 'ban':
        return (
          <>
            <Circle cx={12} cy={12} r={9} {...cp} />
            <Line x1={5.7} y1={5.7} x2={18.3} y2={18.3} {...cp} />
          </>
        );

      /* ── sad ────────────────────────────────────────── */
      case 'sad':
        return (
          <>
            <Circle cx={12} cy={12} r={9} {...cp} />
            <Circle cx={9} cy={10} r={0.75} stroke={color} strokeWidth={strokeWidth} fill={color} />
            <Circle cx={15} cy={10} r={0.75} stroke={color} strokeWidth={strokeWidth} fill={color} />
            <Path d="M8 16c1.33-1.33 2.67-2 4-2s2.67.67 4 2" {...cp} />
          </>
        );

      /* ── celebrate (sparkle) ────────────────────────── */
      case 'celebrate':
        return (
          <>
            <Path d="M12 2v4" {...cp} />
            <Path d="M12 18v4" {...cp} />
            <Path d="M4.93 4.93l2.83 2.83" {...cp} />
            <Path d="M16.24 16.24l2.83 2.83" {...cp} />
            <Path d="M2 12h4" {...cp} />
            <Path d="M18 12h4" {...cp} />
            <Path d="M4.93 19.07l2.83-2.83" {...cp} />
            <Path d="M16.24 7.76l2.83-2.83" {...cp} />
            <Circle cx={12} cy={12} r={2} {...cp} />
          </>
        );

      /* ── fuel ───────────────────────────────────────── */
      case 'fuel':
        return (
          <>
            <Rect x={4} y={4} width={10} height={16} rx={1} {...cp} />
            <Path d="M14 10h2a2 2 0 0 1 2 2v4a1 1 0 0 0 2 0V8l-2-2" {...cp} />
            <Line x1={7} y1={4} x2={7} y2={10} {...cp} />
            <Line x1={11} y1={4} x2={11} y2={10} {...cp} />
            <Line x1={7} y1={7} x2={11} y2={7} {...cp} />
          </>
        );

      /* ── traffic ────────────────────────────────────── */
      case 'traffic':
        return (
          <>
            <Rect x={7} y={2} width={10} height={20} rx={2} {...cp} />
            <Circle cx={12} cy={7} r={1.5} {...cp} />
            <Circle cx={12} cy={12} r={1.5} {...cp} />
            <Circle cx={12} cy={17} r={1.5} {...cp} />
          </>
        );

      /* ── bolt (lightning) ───────────────────────────── */
      case 'bolt':
        return (
          <Path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" {...cp} />
        );

      /* ── pencil ─────────────────────────────────────── */
      case 'pencil':
        return (
          <>
            <Path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" {...cp} />
            <Line x1={15} y1={5} x2={19} y2={9} {...cp} />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderIcon()}
    </Svg>
  );
}
