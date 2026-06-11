import { createId } from "../utils/ids";
import type { CanonicalMenuReplacement } from "../repositories/platformRepository";
import type { POSProvider } from "../../shared/types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(payload: unknown, ...keys: string[]) {
  if (!isObject(payload)) return undefined;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function readNumber(payload: unknown, ...keys: string[]) {
  if (!isObject(payload)) return undefined;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  }
  return undefined;
}

function readTaxMetadata(payload: unknown) {
  if (!isObject(payload)) return {};
  const metadata: Record<string, unknown> = {};
  for (const key of ["tax", "taxes", "taxRate", "tax_rate", "taxCategory", "tax_category", "vat", "vatRate"]) {
    if (payload[key] !== undefined) metadata[key] = payload[key];
  }
  return metadata;
}

function readArray(payload: unknown, ...keys: string[]) {
  if (Array.isArray(payload)) return payload;
  if (!isObject(payload)) return [];
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function readCollection(payload: unknown, ...keys: string[]) {
  if (Array.isArray(payload)) return payload;
  if (!isObject(payload)) return [];
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (isObject(value)) {
      return Object.entries(value).map(([entryKey, entryValue]) =>
        isObject(entryValue) && !readString(entryValue, "_id", "id") ? { _key: entryKey, ...entryValue } : entryValue,
      );
    }
  }
  return [];
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function stableId(prefix: string, restaurantId: string, providerReference: string) {
  const stable = slug(providerReference);
  return stable ? `${prefix}_${slug(restaurantId)}_${stable}` : createId(prefix);
}

function cents(value: unknown) {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric);
}

function productReference(product: unknown) {
  return (
    readString(product, "plu", "referenceId", "productId", "product_id", "id", "_id", "_key", "externalId") ??
    readString(isObject(product) ? product.product : null, "plu", "id", "_id")
  );
}

function productName(product: unknown) {
  return readString(product, "name", "productName", "product_name", "title") ?? "Unnamed item";
}

function productPrice(product: unknown) {
  return cents(
    readNumber(product, "price", "priceCents", "price_cents", "basePrice", "defaultPrice") ??
      readNumber(isObject(product) ? product.price : null, "amount", "centAmount"),
  );
}

function productAvailability(product: unknown): "available" | "unavailable" {
  const status = readString(product, "status", "availability")?.toLowerCase();
  if (status && ["disabled", "unavailable", "inactive", "soldout", "sold_out"].includes(status)) {
    return "unavailable";
  }
  if (isObject(product) && product.isAvailable === false) return "unavailable";
  if (isObject(product) && product.available === false) return "unavailable";
  return "available";
}

function productModifierGroups(product: unknown) {
  return [
    ...readCollection(product, "modifierGroups", "modifier_groups", "modifiers"),
    ...readArray(isObject(product) ? product.product : null, "modifierGroups", "subProducts"),
  ].filter(isObject);
}

function groupMaxSelections(group: unknown) {
  const max = readNumber(group, "maxSelections", "max_selections", "max");
  const multiMax = readNumber(group, "multiMax", "multi_max");
  if (max === 0 && multiMax != null && multiMax > 0) return Math.max(0, Math.round(multiMax));
  if (max != null) return Math.max(0, Math.round(max));
  if (multiMax != null) return Math.max(0, Math.round(multiMax));
  return null;
}

function groupReference(group: unknown) {
  return readString(group, "id", "_id", "modifierGroupId", "plu", "name") ?? createId("mgref");
}

function groupModifiers(group: unknown) {
  return readCollection(group, "modifiers", "items", "products").filter(isObject);
}

function normalizeMenuPayload(payload: unknown) {
  const menus = readArray(payload, "items", "data", "menus");
  return menus.length > 0 ? menus : [payload];
}

export function extractDeliverectMenuImageUrl(payload: unknown) {
  for (const menu of normalizeMenuPayload(payload)) {
    const imageUrl = readString(
      menu,
      "menuImageURL",
      "menuImageUrl",
      "menuImage",
      "imageUrl",
      "image_url",
      "image",
    );
    if (imageUrl) return imageUrl;
  }
  return undefined;
}

export function normalizeDeliverectMenu(
  restaurantId: string,
  payload: unknown,
  provider: POSProvider = "deliverect",
): CanonicalMenuReplacement {
  const items: CanonicalMenuReplacement["items"] = [];
  const modifierGroupsById = new Map<string, CanonicalMenuReplacement["modifierGroups"][number]>();
  const modifiersById = new Map<string, CanonicalMenuReplacement["modifiers"][number]>();
  const mappings: CanonicalMenuReplacement["mappings"] = [];
  const seenItemIds = new Set<string>();

  normalizeMenuPayload(payload).forEach((menu) => {
    const productMap = new Map<string, Record<string, unknown>>();
    const modifierGroupMap = new Map<string, Record<string, unknown>>();
    const modifierMap = new Map<string, Record<string, unknown>>();
    const register = (map: Map<string, Record<string, unknown>>, record: unknown) => {
      if (!isObject(record)) return;
      [
        readString(record, "_id", "id", "_key"),
        readString(record, "plu", "referenceId", "productId", "product_id", "externalId"),
        readString(record, "name"),
      ].filter(Boolean).forEach((reference) => map.set(reference!, record));
    };

    readCollection(menu, "products", "items").forEach((record) => register(productMap, record));
    readCollection(menu, "modifierGroups", "modifier_groups").forEach((record) => register(modifierGroupMap, record));
    readCollection(menu, "modifiers").forEach((record) => register(modifierMap, record));

    const resolveProducts = (references: unknown[]) =>
      references
        .map((reference) => (isObject(reference) ? reference : productMap.get(String(reference))))
        .filter(isObject);
    const resolveGroups = (product: unknown) => {
      const directGroups = productModifierGroups(product);
      const referencedGroups = readArray(product, "subProducts", "subproducts")
        .map((reference) => (isObject(reference) ? reference : modifierGroupMap.get(String(reference))))
        .filter(isObject);
      return [...directGroups, ...referencedGroups];
    };
    const resolveModifiers = (group: unknown) => {
      const directModifiers = groupModifiers(group);
      const referencedModifiers = readArray(group, "subProducts", "subproducts")
        .map((reference) => (isObject(reference) ? reference : modifierMap.get(String(reference)) ?? productMap.get(String(reference))))
        .filter(isObject);
      return [...directModifiers, ...referencedModifiers];
    };

    const categories = readArray(menu, "categories").filter(isObject);
    const standaloneProducts = readCollection(menu, "products", "items").filter(isObject);
    const categoryEntries = categories.length > 0
      ? categories.flatMap((category) => {
          const categoryName = readString(category, "name", "categoryName") ?? "Menu";
          const directProducts = readCollection(category, "products", "items").filter(isObject);
          const referencedProducts = resolveProducts([
            ...readArray(category, "subProducts", "subproducts"),
            ...readArray(category, "sortedChannelProductIds"),
          ]);
          return [...directProducts, ...referencedProducts].map((product) => ({ categoryName, product }));
        })
      : standaloneProducts
          .filter((product) => {
            const productType = readNumber(product, "productType");
            return productType == null || productType === 1;
          })
          .map((product) => ({ categoryName: readString(menu, "name", "menu") ?? "Menu", product }));

    categoryEntries.forEach(({ categoryName, product }, itemIndex) => {
      const providerReference = productReference(product);
      const itemId = stableId("item", restaurantId, providerReference ?? `${categoryName}_${productName(product)}`);
      if (seenItemIds.has(itemId)) return;
      seenItemIds.add(itemId);

      const modifierGroupIds: string[] = [];
      resolveGroups(product).forEach((group, groupIndex) => {
        const groupRef = groupReference(group);
        const groupId = stableId("mg", restaurantId, groupRef);
        modifierGroupIds.push(groupId);
        if (!modifierGroupsById.has(groupId)) {
          const maxSelections = groupMaxSelections(group);
          modifierGroupsById.set(groupId, {
            id: groupId,
            restaurantId,
            name: readString(group, "name", "modifierGroupName") ?? "Options",
            selectionType: (maxSelections ?? 1) === 1 ? "single" : "multi",
            required: Boolean(isObject(group) && (group.required || Number(group.minSelections ?? group.min ?? 0) > 0)),
            minSelections: Math.max(0, Math.round(readNumber(group, "minSelections", "min") ?? 0)),
            maxSelections,
            sortOrder: readNumber(group, "sortOrder", "sort_order", "position") ?? groupIndex,
          });
          mappings.push({
            id: stableId("map", restaurantId, `modifier_group_${groupRef}`),
            restaurantId,
            canonicalType: "modifier_group",
            canonicalId: groupId,
            provider,
            providerReference: groupRef,
            status: "mapped",
          });
        }

        resolveModifiers(group).forEach((modifier, modifierIndex) => {
          const modifierRef = productReference(modifier) ?? readString(modifier, "id", "_id", "name") ?? createId("modref");
          const modifierId = stableId("mod", restaurantId, modifierRef);
          if (!modifiersById.has(modifierId)) {
            modifiersById.set(modifierId, {
              id: modifierId,
              modifierGroupId: groupId,
              name: productName(modifier),
              priceCents: productPrice(modifier),
              isAvailable: productAvailability(modifier) === "available",
              sortOrder: readNumber(modifier, "sortOrder", "sort_order", "position") ?? modifierIndex,
              taxMetadata: readTaxMetadata(modifier),
            });
            mappings.push({
              id: stableId("map", restaurantId, `modifier_${modifierRef}`),
              restaurantId,
              canonicalType: "modifier",
              canonicalId: modifierId,
              provider,
              providerReference: modifierRef,
              status: "mapped",
            });
          }
        });
      });

      items.push({
        id: itemId,
        restaurantId,
        category: categoryName,
        name: productName(product),
        description: readString(product, "description") ?? "",
        imageUrl: readString(product, "imageUrl", "image_url", "image"),
        priceCents: productPrice(product),
        availability: productAvailability(product),
        mappingStatus: providerReference ? "mapped" : "needs_review",
        modifierGroupIds: Array.from(new Set(modifierGroupIds)),
        sortOrder: readNumber(product, "sortOrder", "sort_order", "position") ?? itemIndex,
        taxMetadata: readTaxMetadata(product),
        posRef: {
          provider,
          externalId: providerReference ?? itemId,
        },
      });
      mappings.push({
        id: stableId("map", restaurantId, `item_${providerReference ?? itemId}`),
        restaurantId,
        canonicalType: "item",
        canonicalId: itemId,
        provider,
        providerReference: providerReference ?? itemId,
        status: providerReference ? "mapped" : "needs_review",
      });
    });
  });

  return {
    items,
    modifierGroups: Array.from(modifierGroupsById.values()),
    modifiers: Array.from(modifiersById.values()),
    mappings,
  };
}
