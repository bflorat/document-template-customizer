import { useState, type ChangeEvent } from 'react'
import JSZip from 'jszip'
import './App.css'
import { fetchTemplateAndViews } from './fetchTemplateMetadata'
import { filterViewContent } from './filterViewContent'
import type { TemplateLabelDefinition, TemplateWithViews, ViewSection } from './model'

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

type FilteredView = {
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
  const [previewViews, setPreviewViews] = useState<FilteredView[]>([])

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
      const filteredViews = await buildFilteredViews(baseUrl, labelsToInclude)
      const includedViews = filteredViews.length
      if (!includedViews) {
        throw new Error('No views left after applying label filters.')
      }

      const zip = new JSZip()

      for (const view of filteredViews) {
        if (view.templateContent.trim()) {
          zip.file(`template/${view.file}`, view.templateContent)
        }
        if (view.blankContent.trim()) {
          zip.file(`blank-template/${view.file}`, view.blankContent)
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

      setSuccessMessage(`Generated archive with ${includedViews} view(s).`)
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
      const filteredViews = await buildFilteredViews(baseUrl, labelsToInclude)
      setPreviewViews(filteredViews)
      if (!filteredViews.length) {
        setPreviewError('No views left after applying label filters.')
      }
    } catch (error) {
      setPreviewViews([])
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
            <h3>🏷️ Labels used to insert matching sections</h3>
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
              ) : previewViews.length === 0 ? (
                <p className="empty-row">No views to preview.</p>
              ) : (
                previewViews.map(view => (
                  <div key={view.file} className="preview-view">
                    <h4>
                      {view.name}
                      <span className="preview-file"> ({view.file})</span>
                    </h4>
                    <div className="preview-sections">
                      <details open>
                        <summary>Blank template</summary>
                        <pre>{view.blankContent.trim() ? view.blankContent : '(blank)'}</pre>
                      </details>
                      <details>
                        <summary>Full template</summary>
                        <pre>{view.templateContent.trim() ? view.templateContent : '(blank)'}</pre>
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

async function buildFilteredViews(baseUrl: string, labelsToInclude: string[]): Promise<FilteredView[]> {
  const result = await fetchTemplateAndViews(baseUrl, { strict: false })

  if (labelsToInclude.length) {
    const knownLabels = buildKnownLabelSet(result)
    const unknown = labelsToInclude.filter(label => !knownLabels.has(label))
    if (unknown.length) {
      throw new Error(`Unknown label(s): ${unknown.join(', ')}`)
    }
  }

  const orderMap = new Map(
    result.metadata.data.views.map((view, index) => [view.file, index])
  )

  const orderedViews = [...result.views].sort((a, b) => {
    const aIndex = orderMap.get(a.file) ?? Number.MAX_SAFE_INTEGER
    const bIndex = orderMap.get(b.file) ?? Number.MAX_SAFE_INTEGER
    return aIndex - bIndex
  })

  const filteredViews: FilteredView[] = []

  for (const view of orderedViews) {
    if (!view.content) continue
    const filtered = filterViewContent(view.content, {
      includeLabels: labelsToInclude,
    })

    const hasTemplate = filtered.templateContent.trim().length > 0
    const hasBlank = filtered.blankContent.trim().length > 0
    if (!hasTemplate && !hasBlank) continue

    filteredViews.push({
      name: view.name,
      file: view.file,
      templateContent: filtered.templateContent,
      blankContent: filtered.blankContent,
    })
  }

  return filteredViews
}

function buildKnownLabelSet(result: TemplateWithViews): Set<string> {
  const known = new Set<string>()

  addDefinitions(known, result.metadata.data.labels)
  result.views.forEach(view => {
    view.sections?.forEach(section => addSectionLabels(known, section))
  })

  return known
}

function addDefinitions(set: Set<string>, definitions: TemplateLabelDefinition[] | undefined) {
  definitions?.forEach(def => {
    set.add(def.name)
    def.available_values?.forEach(value => set.add(`${def.name}::${value}`))
  })
}

function addSectionLabels(set: Set<string>, section: ViewSection) {
  section.metadata?.labels?.forEach(label => set.add(label))
  section.children.forEach(child => addSectionLabels(set, child))
}
