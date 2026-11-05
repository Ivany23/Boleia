/** Estilo de mapa limpo (Google Maps / Android): menos ruído, tons suaves da marca. */
export const mapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#F2F5F1' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5F6F66' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D7EEDD' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E1E8E3' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FFE9A6' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#F2CF63' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#BFE3E0' }] },
];
