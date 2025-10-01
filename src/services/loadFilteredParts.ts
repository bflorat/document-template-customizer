import { fetchTemplateAndParts } from '../fetchTemplateManifest'
import { buildFilteredPartsFromResult, buildKnownLabelSet, type FilteredPart } from '../generateFilteredParts'
import { buildAvailableSections as buildAvailableSectionsUtil, buildLabelOrder, compareLabels, definedLabelValues } from '../utils/labels'
import { toDropMap } from '../utils/dropRules'

export type LoadFilteredPartsOptions = {
  includeAnchors?: boolean
}

export type LoadFilteredPartsResult = {
  filteredParts: FilteredPart[]
  readme: { file: string; content: string }
  selectableLabels: string[]
  availableSectionsByPart: Record<string, string[]>
  partNamesByFile: Record<string, string>
  importGroups: Array<{ srcDir: string; destDir: string; files: string[] }>
  templateImportGroups: Array<{ srcDir: string; destDir: string; files: string[] }>
}

export async function loadFilteredParts(
  baseUrl: string,
  labelsToInclude: string[],
  dropRules: Array<{ partFile: string; sectionTitle: string }>,
  opts?: LoadFilteredPartsOptions,
): Promise<LoadFilteredPartsResult> {
  const result = await fetchTemplateAndParts(baseUrl)

  // Build selectable labels from known and manifest-defined multi-values
  const knownSet = buildKnownLabelSet(result)
  const { order: labelOrder, multiValueNames } = buildLabelOrder(result.metadata.data.labels)
  const fromDefinitions = definedLabelValues(result.metadata.data.labels)
  const discoveredSingles = Array.from(knownSet).filter(l => !l.includes('::') && !multiValueNames.has(l))
  const union = new Set<string>([...discoveredSingles, ...fromDefinitions])
  const selectableLabels = Array.from(union)
    .filter(label => !label.endsWith('::*'))
    .sort((a, b) => compareLabels(a, b, labelOrder))

  // Compute effective labels: none OR all selected means keep full template
  const selectedSet = new Set(labelsToInclude)
  const isAllSelected = labelsToInclude.length > 0 &&
    labelsToInclude.length === selectableLabels.length &&
    selectableLabels.every(l => selectedSet.has(l))
  const effectiveLabels = (labelsToInclude.length === 0 || isAllSelected) ? [] : labelsToInclude

  const filteredParts = buildFilteredPartsFromResult(
    result,
    effectiveLabels,
    knownSet,
    toDropMap(dropRules),
    { includeAnchors: opts?.includeAnchors ?? true }
  )

  // Build helper maps
  const availableSectionsByPart = buildAvailableSectionsUtil(result)
  const partNamesByFile = Object.fromEntries(result.metadata.data.parts.map(p => [p.file, p.name]))

  // Build import groups from manifest
  const importGroups: Array<{ srcDir: string; destDir: string; files: string[] }> = []
  if (Array.isArray(result.metadata.data.files_imports)) {
    result.metadata.data.files_imports.forEach(g => {
      if (!g) return
      const src = String((g as any).src_dir || '').trim()
      const dest = String((g as any).dest_dir || '').trim()
      const files = Array.isArray((g as any).files) ? (g as any).files.filter(Boolean) : []
      if (src && files) importGroups.push({ srcDir: src, destDir: dest, files })
    })
  }

  const templateImportGroups: Array<{ srcDir: string; destDir: string; files: string[] }> = []
  if (Array.isArray(result.metadata.data.files_imports_templates)) {
    result.metadata.data.files_imports_templates.forEach(g => {
      if (!g) return
      const src = String((g as any).src_dir || '').trim()
      const dest = String((g as any).dest_dir || '').trim()
      const files = Array.isArray((g as any).files) ? (g as any).files.filter(Boolean) : []
      if (src && files) templateImportGroups.push({ srcDir: src, destDir: dest, files })
    })
  }

  return {
    filteredParts,
    readme: result.readme,
    selectableLabels,
    availableSectionsByPart,
    partNamesByFile,
    importGroups,
    templateImportGroups,
  }
}
