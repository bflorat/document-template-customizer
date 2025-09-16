import { useState, type ChangeEvent } from 'react'
import './App.css'

const defaultIncludingLabels = ['Persistence', 'level::basic', 'level::intermediate']
const defaultExcludingLabels = ['mobile', 'level::advanced']

const App = () => {
  const [templateUrl, setTemplateUrl] = useState('https://...')
  const [keepAllSections, setKeepAllSections] = useState(false)
  const includingLabels = defaultIncludingLabels
  const excludingLabels = defaultExcludingLabels

  const handleTemplateUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTemplateUrl(event.target.value)
  }

  const handleKeepAllChange = (event: ChangeEvent<HTMLInputElement>) => {
    setKeepAllSections(event.target.checked)
  }

  return (
    <div className="app">
      <header>
        <h1>Document Template Customizer</h1>
      </header>
      <form className="template-form">
        <label className="input-group">
          <span>Base template URL</span>
          <input
            type="url"
            placeholder="https://..."
            value={templateUrl}
            onChange={handleTemplateUrlChange}
          />
        </label>

        <div className="labels-layout">
          <section className="labels-panel">
            <h2>Labels used to insert matching sections</h2>
            <table className="labels-table">
              <thead>
                <tr>
                  <th scope="col">Including label</th>
                </tr>
              </thead>
              <tbody>
                {includingLabels.map(label => (
                  <tr key={label}>
                    <td>{label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="labels-panel">
            <h2>Labels used to exclude matching sections</h2>
            <table className="labels-table">
              <thead>
                <tr>
                  <th scope="col">Excluding label</th>
                </tr>
              </thead>
              <tbody>
                {excludingLabels.map(label => (
                  <tr key={label}>
                    <td>{label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

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
          Generate your template
        </button>
      </form>
    </div>
  )
}

export default App
