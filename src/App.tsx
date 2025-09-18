import { useState, type ChangeEvent } from 'react'
import JSZip from 'jszip'
import './App.css'
import { fetchTemplateAndParts } from './fetchTemplateMetadata'
import { filterPartContent } from './filterPartContent'
import type { TemplateLabelDefinition, TemplateWithParts, PartSection } from './model'

const DEFAULT_TEMPLATE_URL = 'https://raw.githubusercontent.com/bflorat/architecture-document-template/refs/heads/feat/add-medadata/'
const defaultIncludingLabels: string[] = []
const availableLabels: string[] = [
  'detail_level::abstract',
  'detail_level::in-depth',
  'level::advanced',
  'level::basic',
  'level::intermediate',
  'mobile',
  'persistence',
  'solution',
]

type FilteredPart = {
  name: string
  file: string
  templateContent: string
  blankContent: string
}

const App = () => {
  const [templateUrl, setTemplateUrl] = useState('')
  const [includingLabels, setIncludingLabels] = useState(defaultIncludingLabels)
  const [isGenerating, setIsGenerating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewParts, setPreviewParts] = useState<FilteredPart[]>([])

  const handleTemplateUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTemplateUrl(event.target.value)
  }

  const handleAvailableLabelClick = (label: string) => {
    setIncludingLabels(prev => {
      if (prev.includes(label)) {
        const filtered = prev.filter(item => item !== label)
        filtered.sort((a, b) => a.localeCompare(b))
        return filtered
      }
      const next = [...prev, label]
      next.sort((a, b) => a.localeCompare(b))
      return next
    })
  }

  const resolveBaseUrl = () => (templateUrl || DEFAULT_TEMPLATE_URL).trim()

  const computeLabelsToInclude = () =>
    includingLabels.map(label => label.trim()).filter(Boolean)

  const handleGenerate = async () => {
    if (isGenerating) return

    const baseUrl = resolveBaseUrl()
    const labelsToInclude = computeLabelsToInclude()

    setIsGenerating(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
    const filteredParts = await buildFilteredParts(baseUrl, labelsToInclude)
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

  const refreshPreview = async () => {
    const baseUrl = resolveBaseUrl()
    const labelsToInclude = computeLabelsToInclude()

    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const filteredParts = await buildFilteredParts(baseUrl, labelsToInclude)
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

  return (
    <div className="app">
      <header>
        <h1>Document Template Customizer</h1>
      </header>
      <form className="template-form">
        <label className="input-group">
          <span>Base template URL:</span>
          <input
            type="url"
            placeholder={DEFAULT_TEMPLATE_URL}
            value={templateUrl}
            onChange={handleTemplateUrlChange}
          />
        </label>

        <section className="labels-panel">
          <div className="available-labels">
            <h3>🏷️ Resulting template only contains sections matching these labels:</h3>
            <ul>
              {availableLabels.map(label => {
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
              })}
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
                <p className="status">Loading preview…</p>
              ) : previewError ? (
                <p className="status status-error">{previewError}</p>
              ) : previewParts.length === 0 ? (
                <p className="empty-row">No parts to preview.</p>
              ) : (
                previewParts.map(part => (
                  <div key={part.file} className="preview-view">
                    <h4>
                      {part.name}
                      <span className="preview-file"> ({part.file})</span>
                    </h4>
                    <div className="preview-sections">
                      <details open>
                        <summary>Blank template</summary>
                        <pre>{part.blankContent.trim() ? part.blankContent : '(blank)'}</pre>
                      </details>
                      <details>
                        <summary>Full template</summary>
                        <pre>{part.templateContent.trim() ? part.templateContent : '(blank)'}</pre>
                      </details>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </section>

        <button type="button" className="primary-action" onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? '⏳ Generating…' : '🚀 Generate your template'}
        </button>
        {errorMessage ? (
          <p className="status status-error">{errorMessage}</p>
        ) : null}
        {successMessage ? (
          <p className="status status-success">{successMessage}</p>
        ) : null}
      </form>
      <footer className="app-footer">
        © 2025 Bertrand Florat — CC BY-SA v4.0 —{' '}
        More in the <a href="https://git.florat.net/bflorat/document-template-customizer" target="_blank" rel="noreferrer">
          project repository
        </a>
      </footer>
    </div>
  )
}

export default App

async function buildFilteredParts(baseUrl: string, labelsToInclude: string[]): Promise<FilteredPart[]> {
  const result = await fetchTemplateAndParts(baseUrl, { strict: false })

  if (labelsToInclude.length) {
    const knownLabels = buildKnownLabelSet(result)
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
