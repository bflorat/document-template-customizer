import type { TemplateLabelDefinition, TemplateWithParts, PartSection } from '../model'

export function buildLabelOrder(definitions: TemplateLabelDefinition[] | undefined): {
  order: Map<string, number>
  multiValueNames: Set<string>
} {
  const order = new Map<string, number>()
  const multiValueNames = new Set<string>()
  if (!definitions?.length) return { order, multiValueNames }

  let priority = 0
  definitions.forEach(def => {
    const name = def.name.trim()
    if (!name) return
    const values = def.available_values
    if (!values?.length) return
    multiValueNames.add(name)
    values.forEach(value => {
      const trimmed = value.trim()
      if (!trimmed) return
      const key = `${name}::${trimmed}`
      if (!order.has(key)) {
        order.set(key, priority++)
      }
    })
  })

  return { order, multiValueNames }
}

export function compareLabels(a: string, b: string, order: Map<string, number>): number {
  const [aGroup, aValue] = a.split('::', 2)
  const [bGroup, bValue] = b.split('::', 2)

  // Primary: group by base label name alphabetically
  const groupCmp = aGroup.localeCompare(bGroup)
  if (groupCmp !== 0) return groupCmp

  // Within the same group, honor metadata order for multi-value labels
  const aKey = aValue !== undefined ? a : undefined
  const bKey = bValue !== undefined ? b : undefined
  const aPriority = aKey ? order.get(aKey) : undefined
  const bPriority = bKey ? order.get(bKey) : undefined

  if (aPriority !== undefined || bPriority !== undefined) {
    if (aPriority === undefined) return 1
    if (bPriority === undefined) return -1
    if (aPriority !== bPriority) return aPriority - bPriority
  }

  // Fallbacks
  if (aValue !== undefined && bValue !== undefined) {
    return aValue.localeCompare(bValue)
  }
  if (aValue !== undefined) return 1
  if (bValue !== undefined) return -1
  return a.localeCompare(b)
}

export function computeMultiValueNamesFromKnown(known: Set<string>): Set<string> {
  const names = new Set<string>()
  for (const label of known) {
    const parts = label.split('::', 2)
    if (parts.length === 2 && parts[0]) names.add(parts[0])
  }
  return names
}

// Optional: make availableSections utility reusable as well
export function buildAvailableSections(result: TemplateWithParts): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  const collect = (acc: Set<string>, section: PartSection) => {
    acc.add(section.title)
    section.children.forEach(child => collect(acc, child))
  }
  result.parts.forEach(part => {
    const set = new Set<string>()
    part.sections?.forEach(section => collect(set, section))
    const titles = Array.from(set.values()).sort((a, b) => a.localeCompare(b))
    map[part.file] = titles
  })
  return map
}

