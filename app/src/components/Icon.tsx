/**
 * Ícones da Boleia: conjunto Lucide (https://lucide.dev, licença ISC), todos no
 * mesmo padrão: grelha 24×24, traço de 2 px, pontas e cantos arredondados.
 * Gerado a partir dos SVG oficiais (lucide-static 1.70.0) para os traços serem exactos.
 */
import React from 'react';
import Svg, { G, Circle, Line, Path, Polygon, Rect } from 'react-native-svg';

export type IconName =
  | 'person'
  | 'car'
  | 'search'
  | 'location'
  | 'flag'
  | 'moon'
  | 'sun'
  | 'clock'
  | 'menu'
  | 'my-location'
  | 'compass'
  | 'expand'
  | 'navigate'
  | 'note'
  | 'map'
  | 'pin'
  | 'swap'
  | 'logout'
  | 'close'
  | 'check'
  | 'star'
  | 'star-outline'
  | 'alert'
  | 'motorcycle'
  | 'back'
  | 'ban'
  | 'sad'
  | 'celebrate'
  | 'fuel'
  | 'traffic'
  | 'bolt'
  | 'pencil'
  | 'plus'
  | 'trash'
  | 'stop'
  | 'route'
  | 'cash'
  | 'phone'
  | 'info'
  | 'shield'
  | 'sand'
  | 'chevron-up'
  | 'chevron-down'
  | 'check-circle'
  | 'wallet'
  | 'taxi'
  | 'palette'
  | 'circle-dot'
  | 'rain'
  | 'timer';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

function shapes(name: IconName) {
  switch (name) {
    case 'person': // lucide: user
      return <><Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><Circle cx="12" cy="7" r="4" /></>;
    case 'car': // lucide: car-front
      return <><Path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8" /><Path d="M7 14h.01" /><Path d="M17 14h.01" /><Rect width="18" height="8" x="3" y="10" rx="2" /><Path d="M5 18v2" /><Path d="M19 18v2" /></>;
    case 'search': // lucide: search
      return <><Path d="m21 21-4.34-4.34" /><Circle cx="11" cy="11" r="8" /></>;
    case 'location': // lucide: map-pin
      return <><Path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><Circle cx="12" cy="10" r="3" /></>;
    case 'flag': // lucide: flag
      return <Path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528" />;
    case 'moon': // lucide: moon
      return <Path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />;
    case 'sun': // lucide: sun
      return <><Circle cx="12" cy="12" r="4" /><Path d="M12 2v2" /><Path d="M12 20v2" /><Path d="m4.93 4.93 1.41 1.41" /><Path d="m17.66 17.66 1.41 1.41" /><Path d="M2 12h2" /><Path d="M20 12h2" /><Path d="m6.34 17.66-1.41 1.41" /><Path d="m19.07 4.93-1.41 1.41" /></>;
    case 'clock': // lucide: clock
      return <><Circle cx="12" cy="12" r="10" /><Path d="M12 6v6l4 2" /></>;
    case 'menu': // lucide: menu
      return <><Path d="M4 5h16" /><Path d="M4 12h16" /><Path d="M4 19h16" /></>;
    case 'my-location': // lucide: locate-fixed
      return <><Line  /><Line  /><Line  /><Line  /><Circle cx="12" cy="12" r="7" /><Circle cx="12" cy="12" r="3" /></>;
    case 'compass': // lucide: compass
      return <><Circle cx="12" cy="12" r="10" /><Path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" /></>;
    case 'expand': // lucide: maximize-2
      return <><Path d="M15 3h6v6" /><Path d="m21 3-7 7" /><Path d="m3 21 7-7" /><Path d="M9 21H3v-6" /></>;
    case 'navigate': // lucide: navigation
      return <Polygon points="3 11 22 2 13 21 11 13 3 11" />;
    case 'note': // lucide: sticky-note
      return <><Path d="M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z" /><Path d="M15 3v5a1 1 0 0 0 1 1h5" /></>;
    case 'map': // lucide: map
      return <><Path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" /><Path d="M15 5.764v15" /><Path d="M9 3.236v15" /></>;
    case 'pin': // lucide: map-pin
      return <><Path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><Circle cx="12" cy="10" r="3" /></>;
    case 'swap': // lucide: arrow-left-right
      return <><Path d="M8 3 4 7l4 4" /><Path d="M4 7h16" /><Path d="m16 21 4-4-4-4" /><Path d="M20 17H4" /></>;
    case 'logout': // lucide: log-out
      return <><Path d="m16 17 5-5-5-5" /><Path d="M21 12H9" /><Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /></>;
    case 'close': // lucide: x
      return <><Path d="M18 6 6 18" /><Path d="m6 6 12 12" /></>;
    case 'check': // lucide: check
      return <Path d="M20 6 9 17l-5-5" />;
    case 'star': // lucide: star
      return <Path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />;
    case 'star-outline': // lucide: star
      return <Path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />;
    case 'alert': // lucide: triangle-alert
      return <><Path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><Path d="M12 9v4" /><Path d="M12 17h.01" /></>;
    case 'motorcycle': // lucide: motorbike
      return <><Path d="m18 14-1-3" /><Path d="m3 9 6 2a2 2 0 0 1 2-2h2a2 2 0 0 1 1.99 1.81" /><Path d="M8 17h3a1 1 0 0 0 1-1 6 6 0 0 1 6-6 1 1 0 0 0 1-1v-.75A5 5 0 0 0 17 5" /><Circle cx="19" cy="17" r="3" /><Circle cx="5" cy="17" r="3" /></>;
    case 'back': // lucide: chevron-left
      return <Path d="m15 18-6-6 6-6" />;
    case 'ban': // lucide: ban
      return <><Circle cx="12" cy="12" r="10" /><Path d="M4.929 4.929 19.07 19.071" /></>;
    case 'sad': // lucide: frown
      return <><Path d="M15 10V9" /><Path d="M9 10V9" /><Path d="M9 16a5 5 0 016 0" /><Circle cx="12" cy="12" r="10" /></>;
    case 'celebrate': // lucide: sparkles
      return <><Path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" /><Path d="M20 2v4" /><Path d="M22 4h-4" /><Circle cx="4" cy="20" r="2" /></>;
    case 'fuel': // lucide: fuel
      return <><Path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5" /><Path d="M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16" /><Path d="M2 21h13" /><Path d="M3 9h11" /></>;
    case 'traffic': // lucide: traffic-cone
      return <><Path d="M16.05 10.966a5 2.5 0 0 1-8.1 0" /><Path d="m16.923 14.049 4.48 2.04a1 1 0 0 1 .001 1.831l-8.574 3.9a2 2 0 0 1-1.66 0l-8.574-3.91a1 1 0 0 1 0-1.83l4.484-2.04" /><Path d="M16.949 14.14a5 2.5 0 1 1-9.9 0L10.063 3.5a2 2 0 0 1 3.874 0z" /><Path d="M9.194 6.57a5 2.5 0 0 0 5.61 0" /></>;
    case 'bolt': // lucide: zap
      return <Path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z" />;
    case 'pencil': // lucide: pencil
      return <><Path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><Path d="m15 5 4 4" /></>;
    case 'plus': // lucide: plus
      return <><Path d="M5 12h14" /><Path d="M12 5v14" /></>;
    case 'trash': // lucide: trash-2
      return <><Path d="M10 11v6" /><Path d="M14 11v6" /><Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><Path d="M3 6h18" /><Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>;
    case 'stop': // lucide: map-pin-plus
      return <><Path d="M19.914 11.105A7.298 7.298 0 0 0 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32 32 0 0 0 .824-.738" /><Circle cx="12" cy="10" r="3" /><Path d="M16 18h6" /><Path d="M19 15v6" /></>;
    case 'route': // lucide: route
      return <><Circle cx="6" cy="19" r="3" /><Path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><Circle cx="18" cy="5" r="3" /></>;
    case 'cash': // lucide: banknote
      return <><Rect width="20" height="12" x="2" y="6" rx="2" /><Circle cx="12" cy="12" r="2" /><Path d="M6 12h.01M18 12h.01" /></>;
    case 'phone': // lucide: smartphone
      return <><Rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><Path d="M12 18h.01" /></>;
    case 'info': // lucide: info
      return <><Circle cx="12" cy="12" r="10" /><Path d="M12 16v-4" /><Path d="M12 8h.01" /></>;
    case 'shield': // lucide: shield-check
      return <><Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><Path d="m9 12 2 2 4-4" /></>;
    case 'sand': // lucide: mountain
      return <Path d="m8 3 4 8 5-5 5 15H2L8 3z" />;
    case 'chevron-up': // lucide: chevron-up
      return <Path d="m18 15-6-6-6 6" />;
    case 'chevron-down': // lucide: chevron-down
      return <Path d="m6 9 6 6 6-6" />;
    case 'check-circle': // lucide: circle-check
      return <><Circle cx="12" cy="12" r="10" /><Path d="m16 9-5.5 5.5L8 12" /></>;
    case 'wallet': // lucide: wallet
      return <><Path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><Path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></>;
    case 'taxi': // lucide: car-taxi-front
      return <><Path d="M10 2h4" /><Path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8" /><Path d="M7 14h.01" /><Path d="M17 14h.01" /><Rect width="18" height="8" x="3" y="10" rx="2" /><Path d="M5 18v2" /><Path d="M19 18v2" /></>;
    case 'palette': // lucide: palette
      return <><Path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /><Circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><Circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><Circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><Circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /></>;
    case 'circle-dot': // lucide: circle-dot
      return <><Circle cx="12" cy="12" r="1" /><Circle cx="12" cy="12" r="10" /></>;
    case 'rain': // lucide: cloud-rain
      return <><Path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><Path d="M16 14v6" /><Path d="M8 14v6" /><Path d="M12 16v6" /></>;
    case 'timer': // lucide: timer
      return <><Line  /><Line  /><Circle cx="12" cy="14" r="8" /></>;
    default:
      return null;
  }
}

export const Icon = React.memo(function Icon({ name, size = 20, color = '#334155', strokeWidth = 2 }: Props) {
  const filled = ["star"].includes(name);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {shapes(name)}
      </G>
    </Svg>
  );
});
