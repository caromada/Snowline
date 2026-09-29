// Driving directions are handed to the maps app the visitor already has:
// Apple Maps on Apple devices, Google Maps everywhere else.
export function directionsUrl(lat: number, lon: number, userAgent: string): string {
  const to = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  return /iPhone|iPad|iPod|Macintosh/.test(userAgent)
    ? `https://maps.apple.com/?daddr=${to}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${to}&travelmode=driving`;
}
