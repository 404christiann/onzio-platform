/**
 * Google Maps directions to an owner-entered address, using Google's documented Maps URL
 * (https://developers.google.com/maps/documentation/urls/get-started#directions-action).
 * Returns "" when no address was entered, so callers show no link.
 */
export function googleMapsDirectionsUrl(address: string | null | undefined): string {
  const destination = address?.trim();
  return destination ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}` : "";
}
