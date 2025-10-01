import { filterPartContent } from './filterPartContent'
import type { TemplateWithParts, PartSection } from './model'

export type FilteredPart = {
  name: string
  file: string
  templateContent: string
  blankContent: string
}

export function buildFilteredPartsFromResult(
  result: TemplateWithParts,
  labelsToInclude: string[],
  knownSet?: Set<string>,
  dropByPart?: Record<string, string[]>,
  opts?: { includeAnchors?: boolean }
): FilteredPart[] {
  // Language comes from the global base template manifest (not section metadata)
  const manifestLang = result.metadata.data.language ?? 'en'
  const knownLabels = knownSet ?? buildKnownLabelSet(result)

  if (labelsToInclude.length) {
    const unknown = labelsToInclude.filter(label => !knownLabels.has(label))
    if (unknown.length) {
      throw new Error(`Unknown label(s): ${unknown.join(', ')}`)
    }
  }

  const orderMap = new Map(
    result.metadata.data.parts.map((part, index) => [part.file, index])
  )

  const orderedParts = [...result.parts].sort((a, b) => {
    const aIndex = orderMap.get(a.file) ?? Number.MAX_SAFE_INTEGER
    const bIndex = orderMap.get(b.file) ?? Number.MAX_SAFE_INTEGER
    return aIndex - bIndex
  })

  const filteredParts: FilteredPart[] = []

  // Build a link index (id -> title) across all parts to resolve See also
  const linkIndex = buildLinkIndex(result)

  for (const part of orderedParts) {
    if (!part.content) continue
    const filtered = filterPartContent(part.content, {
      includeLabels: labelsToInclude,
      dropTitles: (dropByPart?.[part.file] ?? []),
      linkIndex,
      currentFile: part.file,
      includeAnchors: opts?.includeAnchors ?? true,
      manifestLang: manifestLang,
    })

    const hasTemplate = filtered.templateContent.trim().length > 0
    const hasBlank = filtered.blankContent.trim().length > 0
    if (!hasTemplate && !hasBlank) continue

    filteredParts.push({
      name: part.name,
      file: part.file,
      templateContent: filtered.templateContent,
      blankContent: filtered.blankContent,
    })
  }

  return filteredParts
}

export function buildKnownLabelSet(result: TemplateWithParts): Set<string> {
  const known = new Set<string>()
  const defs = result.metadata.data.labels

  // Collect multi-value base names from both manifest and discovered labels
  const manifestMultiNames = new Set<string>((defs ?? []).map(d => d.name?.trim()).filter(Boolean) as string[])
  const discoveredMultiNames = new Set<string>()

  const visit = (section: PartSection) => {
    section.metadata?.labels?.forEach(label => {
      const trimmed = label.trim()
      if (!trimmed) return
      if (trimmed.includes('::')) {
        known.add(trimmed)
        const base = trimmed.split('::', 2)[0]
        if (base) discoveredMultiNames.add(base)
      } else {
        // Skip plain base names that are multi-valued (from manifest or discovery)
        if (manifestMultiNames.has(trimmed)) return
        if (discoveredMultiNames.has(trimmed)) return
        known.add(trimmed)
      }
    })
    section.children.forEach(child => visit(child))
  }
  result.parts.forEach(part => part.sections?.forEach(sec => visit(sec)))

  // Ensure manifest-defined multi-value label values are present even if not used in content
  defs?.forEach(def => {
    const name = def.name?.trim()
    if (!name) return
    const values = def.available_values as string[] | undefined
    values?.forEach(v => {
      const val = String(v).trim()
      if (val) known.add(`${name}::${val}`)
    })
  })

  return known
}

function buildLinkIndex(result: TemplateWithParts): Record<string, { title: string; file: string }> {
  const index: Record<string, { title: string; file: string }> = {}

  const visit = (section: PartSection, file: string) => {
    const id = section.metadata?.id?.trim()
    if (id) index[id] = { title: section.title, file }
    section.children.forEach(child => visit(child, file))
  }

  result.parts.forEach(part => part.sections?.forEach(sec => visit(sec, part.file)))
  return index
}
