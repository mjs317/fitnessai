export const lbsToKg = (lbs: number): number => lbs * 0.453592;
export const kgToLbs = (kg: number): number => kg * 2.20462;
export const kmToMiles = (km: number): number => km * 0.621371;
export const milesToKm = (miles: number): number => miles * 1.60934;

export const formatWeight = (lbs: number): string => `${lbs.toFixed(1)} lbs`;
export const formatDistance = (miles: number): string => `${miles.toFixed(2)} mi`;

export const formatPace = (secPerKm: number): string => {
  const secPerMile = secPerKm * 1.60934;
  const min = Math.floor(secPerMile / 60);
  const sec = Math.round(secPerMile % 60);
  return `${min}:${sec.toString().padStart(2, '0')}/mi`;
};

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};
