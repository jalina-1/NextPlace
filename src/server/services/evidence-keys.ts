export const climateKey = (lat: number, lng: number) => `clim:${lat.toFixed(2)},${lng.toFixed(2)}`;
export const facilitiesKey = (lat: number, lng: number, r: number) => `fac:${lat.toFixed(3)},${lng.toFixed(3)}:r${r}`;
/** Route evidence is user/project-specific and keyed by both endpoints. */
export const routeKey = (projectId: string, from: { lat: number; lng: number }, to: { lat: number; lng: number }) =>
  `route:${projectId}:${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
