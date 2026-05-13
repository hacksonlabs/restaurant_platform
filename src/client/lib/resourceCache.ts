const resourceCache = new Map<string, unknown>();

export function getCachedResource<T>(key: string) {
  return resourceCache.get(key) as T | undefined;
}

export function setCachedResource<T>(key: string, value: T) {
  resourceCache.set(key, value);
}

export function clearResourceCache() {
  resourceCache.clear();
}

export function invalidateResourceCache(prefixes: string[]) {
  for (const key of Array.from(resourceCache.keys())) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      resourceCache.delete(key);
    }
  }
}
