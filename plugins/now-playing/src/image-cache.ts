// Bound retained artwork by both count and string size. A character can occupy
// two bytes, so the default data/URL budget uses at most about 8 MiB of strings.
export function createImageCache(maxEntries = 160, maxChars = 4 * 1024 * 1024) {
  const entries = new Map<string, string>()
  let chars = 0
  return {
    get(url: string): string | undefined {
      const data = entries.get(url)
      if (data !== undefined) {
        entries.delete(url)
        entries.set(url, data)
      }
      return data
    },
    set(url: string, data: string): void {
      const old = entries.get(url)
      if (old !== undefined) {
        chars -= url.length + old.length
        entries.delete(url)
      }
      const size = url.length + data.length
      // An oversized image can still be displayed by its caller without being
      // retained here or evicting every useful small image.
      if (maxEntries <= 0 || size > maxChars) return
      while (entries.size >= maxEntries || chars + size > maxChars) {
        const [key, value] = entries.entries().next().value!
        chars -= key.length + value.length
        entries.delete(key)
      }
      entries.set(url, data)
      chars += size
    }
  }
}
