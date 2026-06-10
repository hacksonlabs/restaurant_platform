function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown> | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function readNumber(source: Record<string, unknown> | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  }
  return undefined;
}

function usefulText(value: string | undefined) {
  if (!value) return undefined;
  return value.toUpperCase() === "UNKNOWN" ? undefined : value;
}

function candidateAddressRecords(payload: Record<string, unknown>): Record<string, unknown>[] {
  const candidates: unknown[] = [
    payload.address,
    payload.locationAddress,
    payload.location_address,
    payload.deliverectLocationAddress,
    payload.deliverect_location_address,
    isRecord(payload.deliverectLocationDetails) ? payload.deliverectLocationDetails.address : undefined,
    isRecord(payload.deliverect_location_details) ? payload.deliverect_location_details.address : undefined,
    isRecord(payload.location) ? payload.location.address : undefined,
    isRecord(payload.store) ? payload.store.address : undefined,
    isRecord(payload.channelRegistration) ? payload.channelRegistration.address : undefined,
  ];
  return candidates.filter(isRecord);
}

function readCoordinates(address: Record<string, unknown>) {
  const explicitLatitude = readNumber(address, "latitude", "lat");
  const explicitLongitude = readNumber(address, "longitude", "lng", "lon");
  if (explicitLatitude != null && explicitLongitude != null) {
    return { latitude: explicitLatitude, longitude: explicitLongitude };
  }

  const coordinates = address.coordinates;
  if (
    isRecord(coordinates) &&
    coordinates.type === "Point" &&
    Array.isArray(coordinates.coordinates) &&
    coordinates.coordinates.length >= 2
  ) {
    const [longitude, latitude] = coordinates.coordinates.map(Number);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  return { latitude: undefined, longitude: undefined };
}

export interface DeliverectLocationAddress {
  formattedAddress: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  latitude?: number;
  longitude?: number;
}

export function extractDeliverectLocationAddress(payload: unknown): DeliverectLocationAddress | null {
  if (!isRecord(payload)) return null;

  for (const address of candidateAddressRecords(payload)) {
    const street = usefulText(readString(address, "street", "streetName", "addressLine1", "line1", "address1"));
    const houseNumber = usefulText(readString(address, "houseNumber", "house_number", "streetNumber"));
    const address1 =
      usefulText(readString(address, "fullAddress", "formattedAddress")) ??
      [houseNumber, street].filter(Boolean).join(" ").trim();
    if (!address1) continue;

    const city = usefulText(readString(address, "city")) ?? "";
    const state = usefulText(readString(address, "stateOrProvince", "state", "province")) ?? "";
    const postalCode = usefulText(readString(address, "postalCode", "postal_code", "zip", "zipCode")) ?? "";
    const { latitude, longitude } = readCoordinates(address);
    const cityLine = [city, state, postalCode].filter(Boolean).join(" ");
    const formattedAddress = [address1, cityLine].filter(Boolean).join(", ");

    return {
      formattedAddress,
      address1,
      city,
      state,
      postalCode,
      latitude,
      longitude,
    };
  }

  return null;
}
