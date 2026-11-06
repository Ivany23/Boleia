// Telemóvel (Android/iOS): mapa nativo. No browser, o Expo usa index.web.tsx (Google Maps / OpenStreetMap).
export { default, Marker, Polyline } from 'react-native-maps';

/** No telemóvel o mapa é nativo: não há nada para pré-carregar. */
export function preloadMap() {}
