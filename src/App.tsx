import { useState, type ChangeEvent } from 'react'
import JSZip from 'jszip'
import './App.css'
import { fetchTemplateAndViews } from './fetchTemplateMetadata'
import { filterViewContent } from './filterViewContent'
import type { TemplateLabelDefinition, TemplateWithViews, ViewSection } from './model'

const DEFAULT_TEMPLATE_URL = 'https://raw.githubusercontent.com/bflorat/architecture-document-template/refs/heads/feat/add-medadata/'
const defaultIncludingLabels: string[] = []
const availableLabels: string[] = [
  'level::basic',
  'level::intermediate',
  'level::advanced',
  'persistence',
  'mobile',
  'detail_level::abstract',
  'detail_level::in-depth',
  'solution',
]

const App = () => {
  const [templateUrl, setTemplateUrl] = useState('')
  const [keepAllSections, setKeepAllSections] = useState(false)
  const [includingLabels, setIncludingLabels] = useState(defaultIncludingLabels)
  const [isGenerating, setIsGenerating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleTemplateUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTemplateUrl(event.target.value)
  }

  const handleKeepAllChange = (event: ChangeEvent<HTMLInputElement>) => {
    setKeepAllSections(event.target.checked)
  }

  const handleLabelChange = (index: number, value: string) => {
    setIncludingLabels(prev => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const handleAddLabel = () => {
    setIncludingLabels(prev => [...prev, ''])
  }

  const handleRemoveLabel = (index: number) => {
    setIncludingLabels(prev => prev.filter((_, i) => i !== index))
  }

  const handleGenerate = async () => {
    if (isGenerating) return

    const baseUrl = (templateUrl || DEFAULT_TEMPLATE_URL).trim()
    const labelsToInclude = keepAllSections
      ? []
      : includingLabels.map(label => label.trim()).filter(Boolean)

    setIsGenerating(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const result = await fetchTemplateAndViews(baseUrl, { strict: false })
      if (labelsToInclude.length) {
        const knownLabels = buildKnownLabelSet(result)
        const unknown = labelsToInclude.filter(label => !knownLabels.has(label))
        if (unknown.length) {
          throw new Error(`Unknown label(s): ${unknown.join(', ')}`)
        }
      }

      const zip = new JSZip()
      let includedViews = 0

      for (const view of result.views) {
        if (!view.content) continue
        const filtered = filterViewContent(view.content, {
          includeLabels: labelsToInclude,
        })

        const hasTemplate = filtered.templateContent.trim().length > 0
        const hasBlank = filtered.blankContent.trim().length > 0

        if (!hasTemplate && !hasBlank) continue

        if (hasTemplate) {
          zip.file(`template/${view.file}`, filtered.templateContent)
        }
        if (hasBlank) {
          zip.file(`blank-template/${view.file}`, filtered.blankContent)
        }
        includedViews += 1
      }

      if (includedViews === 0) {
        throw new Error('No views left after applying label filters.')
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

  return (
    <div className="app">
      <header>
        <h1>📄 Document Template Customizer</h1>
      </header>
      <form className="template-form">
        <label className="input-group">
          <span>Base template URL</span>
          <input
            type="url"
            placeholder={DEFAULT_TEMPLATE_URL}
            value={templateUrl}
            onChange={handleTemplateUrlChange}
          />
        </label>

        <section className="labels-panel">
          <h2>🏷️ Labels used to insert matching sections</h2>
          <table className="labels-table editable">
            <thead>
              <tr>
                <th scope="col">Including label</th>
                <th scope="col" className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {includingLabels.length === 0 ? (
                <tr>
                  <td colSpan={2} className="empty-row">No labels selected yet.</td>
                </tr>
              ) : (
                includingLabels.map((label, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        className="label-input"
                        type="text"
                        value={label}
                        placeholder="level::basic"
                        onChange={event => handleLabelChange(index, event.target.value)}
                      />
                    </td>
                    <td className="actions-cell">
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => handleRemoveLabel(index)}
                        aria-label={`Remove label ${label || index + 1}`}
                      >
                        ❌
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <button type="button" className="secondary-action add-label" onClick={handleAddLabel}>
            Add label
          </button>
          <div className="available-labels">
            <h3>Available labels</h3>
            <ul>
              {availableLabels.map(label => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>
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
    </div>
  )
}

export default App

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
