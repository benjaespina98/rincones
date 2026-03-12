export const haversineDistanceKm = (pointA, pointB) => {
  if (!pointA || !pointB) {
    return Infinity;
  }

  const toRad = (deg) => (deg * Math.PI) / 180;

  const lat1 = Number(pointA.lat);
  const lng1 = Number(pointA.lng);
  const lat2 = Number(pointB.lat);
  const lng2 = Number(pointB.lng);

  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) {
    return Infinity;
  }

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const earthRadiusKm = 6371;

  return earthRadiusKm * c;
};
