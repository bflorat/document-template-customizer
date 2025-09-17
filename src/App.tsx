import { useState, type ChangeEvent } from 'react'
import './App.css'

const DEFAULT_TEMPLATE_URL = 'https://raw.githubusercontent.com/bflorat/architecture-document-template/refs/heads/feat/add-medadata/'
const defaultIncludingLabels = ['Persistence', 'level::basic', 'level::intermediate']

const App = () => {
  const [templateUrl, setTemplateUrl] = useState('')
  const [keepAllSections, setKeepAllSections] = useState(false)
  const [includingLabels, setIncludingLabels] = useState(defaultIncludingLabels)

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
        </section>

        <p className="or-text">or</p>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={keepAllSections}
            onChange={handleKeepAllChange}
          />
          <span>Keep all sections from the base template</span>
        </label>

        <button type="button" className="primary-action">
          🚀 Generate your template 
        </button>
      </form>
    </div>
  )
}

export default App
