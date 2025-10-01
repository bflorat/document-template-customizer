export function toDropMap(rules: Array<{ partFile: string; sectionTitle: string }>): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const r of rules) {
    const title = r.sectionTitle?.trim()
    if (!r.partFile || !title) continue
    if (!map[r.partFile]) map[r.partFile] = []
    if (!map[r.partFile].includes(title)) map[r.partFile].push(title)
  }
  return map
}

