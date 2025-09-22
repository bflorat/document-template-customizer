import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react'
import JSZip from 'jszip'
import { stringify, parse as parseYaml } from 'yaml'
import './App.css'
import { fetchTemplateAndParts } from './fetchTemplateMetadata'
import { filterPartContent } from './filterPartContent'
import type { TemplateLabelDefinition, TemplateWithParts, PartSection } from './model'

const DEFAULT_TEMPLATE_URL = 'https://raw.githubusercontent.com/bflorat/architecture-document-template/refs/heads/feat/add-medadata/'
const defaultIncludingLabels: string[] = []

type FilteredPart = {
  name: string
  file: string
  templateContent: string
  blankContent: string
}

type TemplateLoadInfo =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'loaded'; durationMs: number }
  | { state: 'error'; message: string };

const App = () => {
  const [templateUrl, setTemplateUrl] = useState('')
  const [includingLabels, setIncludingLabels] = useState(defaultIncludingLabels)
  const [availableLabels, setAvailableLabels] = useState<string[]>([])
  const [expandedParts, setExpandedParts] = useState<Record<string, { blank: boolean; full: boolean }>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewParts, setPreviewParts] = useState<FilteredPart[]>([])
  const [templateLoadInfo, setTemplateLoadInfo] = useState<TemplateLoadInfo>({ state: 'idle' })
  const [didAutoSelectAll, setDidAutoSelectAll] = useState(false)
  const [availableSectionsByPart, setAvailableSectionsByPart] = useState<Record<string, string[]>>({})
  const [dropRules, setDropRules] = useState<Array<{ id: string; partFile: string; sectionTitle: string }>>([])
  const [partNamesByFile, setPartNamesByFile] = useState<Record<string, string>>({})
  const [includeAnchors, setIncludeAnchors] = useState(true)
  const contextFileInputRef = useRef<HTMLInputElement | null>(null)
  const lastLoadedBaseUrlRef = useRef<string | null>(null)

  const resetStateForNewBase = () => {
    setIncludingLabels([])
    setDidAutoSelectAll(false)
    setAvailableLabels([])
    setAvailableSectionsByPart({})
    setPartNamesByFile({})
    setDropRules([])
    setExpandedParts({})
    setPreviewParts([])
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  const handleTemplateUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTemplateUrl(event.target.value)
  }

  const handleAvailableLabelClick = async (label: string) => {
    const next = includingLabels.includes(label)
      ? includingLabels.filter(item => item !== label)
      : [...includingLabels, label]
    next.sort((a, b) => a.localeCompare(b))
    setIncludingLabels(next)
    if (previewOpen) {
      await refreshPreview(next)
    }
  }

  const resolveBaseUrl = () => (templateUrl || DEFAULT_TEMPLATE_URL).trim()

  const computeLabelsToInclude = () =>
    includingLabels.map(label => label.trim()).filter(Boolean)

  const handleLoadTemplate = async () => {
    const baseUrl = resolveBaseUrl()
    const baseChanged = !!lastLoadedBaseUrlRef.current && lastLoadedBaseUrlRef.current !== baseUrl
    if (baseChanged) {
      // Base URL changed: clear cached selections and derived state
      resetStateForNewBase()
    }
    // Important: do not rely on state immediately after reset; use [] when base changed
    const labelsToInclude = baseChanged ? [] : computeLabelsToInclude()
    try {
      await loadFilteredParts(baseUrl, labelsToInclude)
      lastLoadedBaseUrlRef.current = baseUrl
    } catch {
      // loadFilteredParts already updates templateLoadInfo with the error
    }
  }

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await handleLoadTemplate()
  }

  const loadFilteredParts = async (
    baseUrl: string,
    labelsToInclude: string[],
    opts?: { skipAutoSelect?: boolean; includeAnchors?: boolean }
  ): Promise<{ filteredParts: FilteredPart[]; readme: { file: string; content: string } }> => {
    setTemplateLoadInfo({ state: 'loading' })
    const start = performance.now()
    setAvailableLabels([])
    setPreviewParts([])
    try {
      const result = await fetchTemplateAndParts(baseUrl)
      const knownSet = buildKnownLabelSet(result)
      const { order: labelOrder, multiValueNames } = buildLabelOrder(result.metadata.data.labels)
      const discoveredMulti = computeMultiValueNamesFromKnown(knownSet)
      const allMulti = new Set<string>([...multiValueNames, ...discoveredMulti])
      const selectableLabels = Array.from(knownSet)
        .filter(label => !label.endsWith('::*') && !allMulti.has(label))
        .sort((a, b) => compareLabels(a, b, labelOrder))
      setAvailableLabels(selectableLabels)
      setAvailableSectionsByPart(buildAvailableSections(result))
      setPartNamesByFile(Object.fromEntries(result.metadata.data.parts.map(p => [p.file, p.name])))

      // Select all available labels by default on first load (UI only)
      if (!opts?.skipAutoSelect && !didAutoSelectAll && includingLabels.length === 0) {
        setIncludingLabels(selectableLabels)
        setDidAutoSelectAll(true)
      }

      // Matching rule: if none OR all labels are selected, keep full template
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
      setExpandedParts(prev => {
        const nextState: Record<string, { blank: boolean; full: boolean }> = {}
        filteredParts.forEach(part => {
          const existing = prev[part.file]
          nextState[part.file] = existing ?? { blank: false, full: false }
        })
        return nextState
      })
      const durationMs = performance.now() - start
      setTemplateLoadInfo({ state: 'loaded', durationMs })
      return { filteredParts, readme: result.readme }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setTemplateLoadInfo({ state: 'error', message })
      throw error
    }
  }

  const handleGenerate = async () => {
    if (isGenerating) return

    const baseUrl = resolveBaseUrl()
    const labelsToInclude = computeLabelsToInclude()
    const startTime = performance.now()

    setIsGenerating(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const { filteredParts, readme: fetchedReadme } = await loadFilteredParts(baseUrl, labelsToInclude, { includeAnchors })
      const includedParts = filteredParts.length
      if (!includedParts) {
        throw new Error('No parts left after applying label filters.')
      }

      const zip = new JSZip()

      for (const part of filteredParts) {
        if (part.templateContent.trim()) {
          zip.file(`template/${part.file}`, part.templateContent)
        }
        if (part.blankContent.trim()) {
          zip.file(`blank-template/${part.file}`, part.blankContent)
        }
      }

      if (fetchedReadme?.content) {
        zip.file(`template/${fetchedReadme.file}`, fetchedReadme.content)
      }

      const droppedSections = toDropMap(dropRules)

      zip.file(
        'customization-context.yaml',
        stringify({
          generated_at: new Date().toISOString(),
          base_template_url: baseUrl,
          selected_labels: labelsToInclude,
          dropped_sections: droppedSections,
        })
      )

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'custom-template.zip'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      const durationMs = performance.now() - startTime
      setSuccessMessage(`Generated archive with ${includedParts} part(s) in ${formatDuration(durationMs)}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message)
    } finally {
      setIsGenerating(false)
    }
  }

  const refreshPreview = async (overrideLabels?: string[]) => {
    const baseUrl = resolveBaseUrl()
    const labelsToInclude = overrideLabels ?? computeLabelsToInclude()

    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const { filteredParts } = await loadFilteredParts(baseUrl, labelsToInclude, { includeAnchors })
      setPreviewParts(filteredParts)
      if (!filteredParts.length) {
        setPreviewError('No parts left after applying label filters.')
      }
    } catch (error) {
      setPreviewParts([])
      const message = error instanceof Error ? error.message : String(error)
      setPreviewError(message)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleTogglePreview = async () => {
    const next = !previewOpen
    setPreviewOpen(next)
    if (next) {
      await refreshPreview()
    }
  }

  const handleRefreshPreview = async () => {
    if (!previewOpen || previewLoading) return
    await refreshPreview()
  }

  type CustomizationContext = {
    generated_at?: string
    base_template_url?: string
    selected_labels?: string[]
    dropped_sections?: Record<string, string[]>
  }

  const openContextFilePicker = () => {
    contextFileInputRef.current?.click()
  }

  const handleContextFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const ctx = parseYaml(text) as CustomizationContext
      const baseUrl = (ctx.base_template_url ?? '').trim()
      const loadedLabels = (ctx.selected_labels ?? []).map(v => v.trim()).filter(Boolean)
      const dropped = ctx.dropped_sections ?? {}

      if (baseUrl) setTemplateUrl(baseUrl)
      setIncludingLabels(loadedLabels)
      setDidAutoSelectAll(true)

      // Build drop rules from context map
      const rules: Array<{ id: string; partFile: string; sectionTitle: string }> = []
      Object.entries(dropped).forEach(([partFile, titles]) => {
        (titles ?? []).forEach(title => {
          if (!title) return
          rules.push({ id: `${partFile}:${title}:${Math.random()}`, partFile, sectionTitle: title })
        })
      })
      setDropRules(rules)

      // Load template and preview with loaded labels
      const effectiveBase = baseUrl || resolveBaseUrl()
      if (lastLoadedBaseUrlRef.current && lastLoadedBaseUrlRef.current !== effectiveBase) {
        resetStateForNewBase()
      }
      await loadFilteredParts(effectiveBase, loadedLabels, { skipAutoSelect: true })
      lastLoadedBaseUrlRef.current = effectiveBase
      if (previewOpen) await refreshPreview()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErrorMessage(`Failed to load customization-context.yaml: ${msg}`)
    } finally {
      // reset input value so the same file can be selected again if needed
      if (contextFileInputRef.current) contextFileInputRef.current.value = ''
    }
  }

  const handleAddDropRule = () => {
    const firstPart = Object.keys(availableSectionsByPart)[0] ?? ''
    const newRule = { id: String(Date.now() + Math.random()), partFile: firstPart, sectionTitle: '' }
    setDropRules(prev => [...prev, newRule])
  }

  const handleRemoveDropRule = (id: string) => {
    setDropRules(prev => prev.filter(r => r.id !== id))
  }

  const handleChangeRulePart = (id: string, partFile: string) => {
    setDropRules(prev => prev.map(r => (r.id === id ? { ...r, partFile, sectionTitle: '' } : r)))
  }

  const handleChangeRuleTitle = (id: string, title: string) => {
    setDropRules(prev => prev.map(r => (r.id === id ? { ...r, sectionTitle: title } : r)))
  }

  // Auto-refresh preview when options affecting preview change and preview is open
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!previewOpen) return
    void refreshPreview()
  }, [dropRules, includeAnchors, previewOpen])

  const handleSectionToggle = (file: string, section: 'blank' | 'full', open: boolean) => {
    setExpandedParts(prev => {
      const current = prev[file] ?? { blank: true, full: false }
      return {
        ...prev,
        [file]: {
          ...current,
          [section]: open,
        },
      }
    })
  }

  return (
    <div className="app">
      <header>
        <h1>📐 Document Template Customizer</h1>
        <p>Produce a personalized curated document template from a larger base template.</p>
      </header>
      <form className="template-form" onSubmit={e => { void handleFormSubmit(e) }}>
        <label className="input-group">
          <span>Base template URL:</span>
          <input
            type="url"
            placeholder={DEFAULT_TEMPLATE_URL}
            value={templateUrl}
            onChange={handleTemplateUrlChange}
          />
        </label>
        <div className="load-actions">
          <button
            type="button"
            className="secondary-action load-template"
            onClick={() => { void handleLoadTemplate() }}
            disabled={templateLoadInfo.state === 'loading'}
          >
            {templateLoadInfo.state === 'loading' ? 'Loading…' : 'Load base template'}
          </button>
          <div className="config-loader">
            <input
              ref={contextFileInputRef}
              type="file"
              accept=".yaml,.yml,text/yaml,application/x-yaml,application/yaml"
              style={{ display: 'none' }}
              onChange={e => { void handleContextFileChange(e) }}
            />
            <button type="button" className="secondary-action" onClick={openContextFilePicker}>
              Reload previous customization
            </button>
          </div>
        </div>
        <TemplateLoadIndicator info={templateLoadInfo} />

        <section className="labels-panel">
          <div className="available-labels">
            <h3>🏷️ Resulting template only contains sections matching these labels:</h3>
            <ul>
              {templateLoadInfo.state === 'loading' ? (
                <li className="empty-label">Loading labels…</li>
              ) : availableLabels.length === 0 ? (
                <li className="empty-label">No labels found.</li>
              ) : (
                availableLabels.map(label => {
                  const isSelected = includingLabels.includes(label)
                  return (
                    <li
                      key={label}
                      onClick={() => { void handleAvailableLabelClick(label) }}
                      className={isSelected ? 'label-chip selected' : 'label-chip'}
                    >
                      {label}
                    </li>
                  )
                })
              )}
            </ul>            
          </div>
        </section>

        <section className="drop-rules-panel">
          <div className="drop-header">
            <h3>🧹 Drop specific sections (optional)</h3>
            <button type="button" className="secondary-action" onClick={handleAddDropRule}>Add item</button>
          </div>
          <div className="drop-table-wrapper">
            {dropRules.length === 0 ? (
              <p className="empty-row">No drop rules. Add one to remove specific sections in addition to labels matching</p>
            ) : (
              <table className="drop-rules-table">
                <thead>
                  <tr>
                    <th>Part</th>
                    <th>Section title</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dropRules.map(rule => {
                    const parts = Object.keys(availableSectionsByPart)
                    const options = availableSectionsByPart[rule.partFile] ?? []
                    const datalistId = `dl-${rule.id}`
                    return (
                      <tr key={rule.id}>
                        <td>
                          <select
                            value={rule.partFile}
                            onChange={e => handleChangeRulePart(rule.id, e.target.value)}
                          >
                            {parts.map(file => (
                              <option key={file} value={file}>
                                {partNamesByFile[file] ?? file}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="text"
                            value={rule.sectionTitle}
                            onChange={e => handleChangeRuleTitle(rule.id, e.target.value)}
                            list={datalistId}
                            placeholder="Type or pick a section title"
                          />
                          <datalist id={datalistId}>
                            {options.map(title => (
                              <option key={title} value={title} />
                            ))}
                          </datalist>
                        </td>
                        <td>
                          <button type="button" className="secondary-action icon-only" onClick={() => handleRemoveDropRule(rule.id)} title="Remove">
                            ✖
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

         <section className="options-panel">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={includeAnchors}
              onChange={(e) => { setIncludeAnchors(e.target.checked); if (previewOpen) { void refreshPreview(); } }}
            />
            <span>Include anchors <span className="mono">[#id]</span> in outputs so links can be included between sections</span>
          </label>
        </section>

        <section className="preview-panel">
          <div className="preview-header">
            <button
              type="button"
              className="secondary-action"
              onClick={() => { void handleTogglePreview() }}
              disabled={templateLoadInfo.state !== 'loaded' && !previewOpen}
              title={templateLoadInfo.state !== 'loaded' && !previewOpen ? 'Load a base template first' : undefined}
            >
              {previewOpen ? 'Hide preview' : 'Show preview'}
            </button>
            {previewOpen ? (
              <button
                type="button"
                className="secondary-action"
                onClick={() => { void handleRefreshPreview() }}
                disabled={templateLoadInfo.state !== 'loaded' || previewLoading}
                title={templateLoadInfo.state !== 'loaded' ? 'Load a base template first' : undefined}
              >
                Refresh preview
              </button>
            ) : null}
          </div>
          {previewOpen ? (
            <div className="preview-body">
              {previewLoading ? (
                <p className="alert alert--info">Loading preview…</p>
              ) : previewError ? (
                <p className="alert alert--warning">{previewError}</p>
              ) : previewParts.length === 0 ? (
                <p className="empty-row">No parts to preview.</p>
              ) : (
                previewParts.map(part => {
                  const state = expandedParts[part.file] ?? { blank: true, full: false }
                  return (
                    <div key={part.file} className="preview-view">
                      <h4>
                        {part.name}
                        <span className="preview-file"> ({part.file})</span>
                      </h4>
                      <div className="preview-sections">
                        <details
                          open={state.blank}
                          onToggle={event =>
                            handleSectionToggle(part.file, 'blank', (event.target as HTMLDetailsElement).open)
                          }
                        >
                          <summary>Blank template</summary>
                          <pre>{part.blankContent.trim() ? part.blankContent : '(blank)'}</pre>
                        </details>
                        <details
                          open={state.full}
                          onToggle={event =>
                            handleSectionToggle(part.file, 'full', (event.target as HTMLDetailsElement).open)
                          }
                        >
                          <summary>Full template</summary>
                          <pre>{part.templateContent.trim() ? part.templateContent : '(blank)'}</pre>
                        </details>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          ) : null}
        </section>

        <button
          type="button"
          className="primary-action"
          onClick={() => { void handleGenerate() }}
          disabled={templateLoadInfo.state !== 'loaded' || isGenerating}
          title={templateLoadInfo.state !== 'loaded' ? 'Load a base template first' : undefined}
        >
          {isGenerating ? '⏳ Generating…' : '🚀 Generate your template'}
        </button>
        {errorMessage ? (
          <p className="alert alert--error">{errorMessage}</p>
        ) : null}
        {successMessage ? (
          <p className="alert alert--info">{successMessage}</p>
        ) : null}
      </form>
      <footer className="app-footer">
        © 2025 Bertrand Florat — <a href='https://www.gnu.org/licenses/agpl-3.0.en.html'>AGPL V3.0</a> —{' '}
        CLI, full documentation and more in the <a href="https://github.com/bflorat/document-template-customizer" target="_blank" rel="noreferrer">
          project repository
        </a>
        {' '}— v{__APP_VERSION__}
      </footer>
    </div>
  )
}

function TemplateLoadIndicator({ info }: { info: TemplateLoadInfo }) {
  if (info.state === 'idle') {
    return (
      <p className="template-load-status alert alert--info">
        Tip — load the base template to start or reload a past customization from a <span className="mono">customization-context.yaml</span> file located in a previous generated template.
      </p>
    )
  }
  if (info.state === 'loading') {
    return <p className="template-load-status alert alert--info">Loading base template…</p>
  }
  if (info.state === 'loaded') {
    return (
      <p className="template-load-status alert alert--info">
        Base template loaded successfully in {formatDuration(info.durationMs)}
      </p>
    )
  }
  return (
    <p className="template-load-status alert alert--error">
      Failed to load base template: {info.message}
    </p>
  )
}

export default App

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '0 ms'
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`
  return `${Math.round(ms)} ms`
}

function buildFilteredPartsFromResult(
  result: TemplateWithParts,
  labelsToInclude: string[],
  knownSet?: Set<string>,
  dropByPart?: Record<string, string[]>,
  opts?: { includeAnchors?: boolean }
): FilteredPart[] {
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

function buildKnownLabelSet(result: TemplateWithParts): Set<string> {
  const known = new Set<string>()
  // Discover labels from sections across all parts; ignore YAML label definitions
  const visit = (section: PartSection) => {
    section.metadata?.labels?.forEach(label => {
      const trimmed = label.trim()
      if (trimmed) known.add(trimmed)
    })
    section.children.forEach(child => visit(child))
  }
  result.parts.forEach(part => part.sections?.forEach(sec => visit(sec)))
  return known
}

function computeMultiValueNamesFromKnown(known: Set<string>): Set<string> {
  const names = new Set<string>()
  for (const label of known) {
    const parts = label.split('::', 2)
    if (parts.length === 2 && parts[0]) names.add(parts[0])
  }
  return names
}

// Labels are discovered from part sections; YAML label definitions are ignored for discovery

function buildAvailableSections(result: TemplateWithParts): Record<string, string[]> {
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

function toDropMap(rules: Array<{ partFile: string; sectionTitle: string }>): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const r of rules) {
    const title = r.sectionTitle?.trim()
    if (!r.partFile || !title) continue
    if (!map[r.partFile]) map[r.partFile] = []
    if (!map[r.partFile].includes(title)) map[r.partFile].push(title)
  }
  return map
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

function buildLabelOrder(definitions: TemplateLabelDefinition[] | undefined): {
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

function compareLabels(a: string, b: string, order: Map<string, number>): number {
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
