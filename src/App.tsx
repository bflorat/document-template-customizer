import { useState, type ChangeEvent, type FormEvent } from 'react'
import JSZip from 'jszip'
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
    const labelsToInclude = computeLabelsToInclude()
    try {
      await loadFilteredParts(baseUrl, labelsToInclude)
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
    labelsToInclude: string[]
  ): Promise<{ filteredParts: FilteredPart[]; readme: { file: string; content: string } }> => {
    setTemplateLoadInfo({ state: 'loading' })
    const start = performance.now()
    setAvailableLabels([])
    setPreviewParts([])
    try {
      const result = await fetchTemplateAndParts(baseUrl, { strict: false })
      const knownSet = buildKnownLabelSet(result)
      const selectableLabels = Array.from(knownSet)
        .filter(label => !label.endsWith('::*'))
        .sort((a, b) => a.localeCompare(b))
      setAvailableLabels(selectableLabels)
      const filteredParts = buildFilteredPartsFromResult(result, labelsToInclude, knownSet)
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

    setIsGenerating(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const { filteredParts, readme: fetchedReadme } = await loadFilteredParts(baseUrl, labelsToInclude)
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
        zip.file(fetchedReadme.file, fetchedReadme.content)
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'custom-template.zip'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setSuccessMessage(`Generated archive with ${includedParts} part(s).`)
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
      const { filteredParts } = await loadFilteredParts(baseUrl, labelsToInclude)
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
      </header>
      <form className="template-form" onSubmit={handleFormSubmit}>
        <label className="input-group">
          <span>Base template URL:</span>
          <input
            type="url"
            placeholder={DEFAULT_TEMPLATE_URL}
            value={templateUrl}
            onChange={handleTemplateUrlChange}
          />
        </label>
        <TemplateLoadIndicator info={templateLoadInfo} />
        <button
          type="button"
          className="secondary-action load-template"
          onClick={handleLoadTemplate}
          disabled={templateLoadInfo.state === 'loading'}
        >
          {templateLoadInfo.state === 'loading' ? 'Loading…' : 'Load base template'}
        </button>

        <section className="labels-panel">
          <div className="available-labels">
            <h3>🏷️ Resulting template only contains sections matching these labels:</h3>
            <p>(Select none label to get the full base template)</p>
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
                      onClick={() => handleAvailableLabelClick(label)}
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

        <section className="preview-panel">
          <div className="preview-header">
            <button type="button" className="secondary-action" onClick={handleTogglePreview}>
              {previewOpen ? 'Hide preview' : 'Show preview'}
            </button>
            {previewOpen ? (
              <button
                type="button"
                className="secondary-action"
                onClick={handleRefreshPreview}
                disabled={previewLoading}
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

        <button type="button" className="primary-action" onClick={handleGenerate} disabled={isGenerating}>
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
        © 2025 Bertrand Florat — <a href='https://creativecommons.org/licenses/by-sa/4.0/'>CC BY-SA v4.0</a> —{' '}
        CLI, full documentation and more in the <a href="https://git.florat.net/bflorat/document-template-customizer" target="_blank" rel="noreferrer">
          project repository
        </a>
      </footer>
    </div>
  )
}

function TemplateLoadIndicator({ info }: { info: TemplateLoadInfo }) {
  if (info.state === 'idle') {
    return (
      <p className="template-load-status alert alert--info">
        Tip — load the base template to start.
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
  knownSet?: Set<string>
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

  for (const part of orderedParts) {
    if (!part.content) continue
    const filtered = filterPartContent(part.content, {
      includeLabels: labelsToInclude,
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

  addDefinitions(known, result.metadata.data.labels)
  result.parts.forEach(part => {
    part.sections?.forEach(section => addSectionLabels(known, section))
  })

  return known
}

function addDefinitions(set: Set<string>, definitions: TemplateLabelDefinition[] | undefined) {
  definitions?.forEach(def => {
    set.add(def.name)
    def.available_values?.forEach(value => set.add(`${def.name}::${value}`))
  })
}

function addSectionLabels(set: Set<string>, section: PartSection) {
  section.metadata?.labels?.forEach(label => set.add(label))
  section.children.forEach(child => addSectionLabels(set, child))
}
