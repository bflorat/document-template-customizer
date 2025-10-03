import { useState, useEffect, useRef, useCallback, type ChangeEvent, type FormEvent } from 'react'
import JSZip from 'jszip'
import { stringify, parse as parseYaml } from 'yaml'
import './App.css'
import type { FilteredPart } from './generateFilteredParts'
import { loadFilteredParts as loadFilteredPartsService } from './services/loadFilteredParts'
import { toDropMap } from './utils/dropRules'
import { computeZipRel } from './utils/blankImports'

const DEFAULT_TEMPLATE_URL = 'https://raw.githubusercontent.com/bflorat/architecture-document-template/refs/heads/master/'
const defaultIncludingLabels: string[] = []

// FilteredPart type now provided by generateFilteredParts

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
  const [availableSectionsTreeByPart, setAvailableSectionsTreeByPart] = useState<Record<string, Array<{ title: string; level: number }>>>({})
  const [dropRules, setDropRules] = useState<Array<{ id: string; partFile: string; sectionTitle: string }>>([])
  const [lastAddedRuleId, setLastAddedRuleId] = useState<string | null>(null)
  const [flashRuleIds, setFlashRuleIds] = useState<Record<string, boolean>>({})
  const ruleRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})
  const [partNamesByFile, setPartNamesByFile] = useState<Record<string, string>>({})
  const [includeAnchors, setIncludeAnchors] = useState(true)
  const [exportMode, setExportMode] = useState<'both' | 'blank' | 'full'>('both')
  const [copyStatus, setCopyStatus] = useState<Record<string, 'copied' | 'error'>>({})
  const contextFileInputRef = useRef<HTMLInputElement | null>(null)
  const generateBtnRef = useRef<HTMLButtonElement | null>(null)
  const lastLoadedBaseUrlRef = useRef<string | null>(null)

  // Prefill base URL from ?base_template_url=... (supports legacy ?base_url=...)
  // If provided, automatically load the template on startup.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const fromQuery = (
        params.get('base_template_url') ??
        params.get('base_url') ??
        params.get('vase_template_url') /* tolerate typo */ ??
        ''
      ).trim()
      if (fromQuery) {
        setTemplateUrl(fromQuery)
        void handleLoadTemplate(fromQuery)
      }
    } catch {
      // ignore malformed URLs or environments without window
    }
  }, [])

  // Do not auto-select a part when parts list becomes available; user must choose explicitly

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

  const handleLoadTemplate = async (overrideBaseUrl?: string) => {
    const baseUrl = (overrideBaseUrl ?? resolveBaseUrl())
    const baseChanged = !!lastLoadedBaseUrlRef.current && lastLoadedBaseUrlRef.current !== baseUrl
    if (baseChanged) {
      // Base URL changed: clear cached selections and derived state
      resetStateForNewBase()
    }
    // Important: do not rely on state immediately after reset; use [] when base changed
    const labelsToInclude = baseChanged ? [] : computeLabelsToInclude()
    setTemplateLoadInfo({ state: 'loading' })
    const start = performance.now()
    try {
      const res = await loadFilteredPartsService(baseUrl, labelsToInclude, dropRules.map(r => ({ partFile: r.partFile, sectionTitle: r.sectionTitle })), { includeAnchors })
      // Update derived states
      setAvailableLabels(res.selectableLabels)
      setAvailableSectionsByPart(res.availableSectionsByPart)
      setAvailableSectionsTreeByPart(res.availableSectionsTreeByPart)
      setPartNamesByFile(res.partNamesByFile)

      // Auto-select all labels on first load if none provided
      const shouldAutoSelect = (baseChanged || !didAutoSelectAll) && labelsToInclude.length === 0
      if (shouldAutoSelect) {
        setIncludingLabels(res.selectableLabels)
        setDidAutoSelectAll(true)
      }

      // Ensure expandedParts has an entry for each part
      setExpandedParts(prev => {
        const nextState: Record<string, { blank: boolean; full: boolean }> = {}
        res.filteredParts.forEach(part => {
          const existing = prev[part.file]
          nextState[part.file] = existing ?? { blank: false, full: false }
        })
        return nextState
      })

      setTemplateLoadInfo({ state: 'loaded', durationMs: performance.now() - start })
      lastLoadedBaseUrlRef.current = baseUrl
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setTemplateLoadInfo({ state: 'error', message })
    }
  }

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await handleLoadTemplate()
  }

  // loadFilteredParts moved to services; use it directly where needed

  const copyToClipboard = async (key: string, text: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback using a temporary textarea
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopyStatus(prev => ({ ...prev, [key]: 'copied' }))
      window.setTimeout(() => {
        setCopyStatus(prev => { const next = { ...prev }; delete next[key]; return next })
      }, 1500)
    } catch {
      setCopyStatus(prev => ({ ...prev, [key]: 'error' }))
      window.setTimeout(() => {
        setCopyStatus(prev => { const next = { ...prev }; delete next[key]; return next })
      }, 2000)
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
      const { filteredParts, readme: fetchedReadme, importGroups, templateImportGroups } = await loadFilteredPartsService(baseUrl, labelsToInclude, dropRules.map(r => ({ partFile: r.partFile, sectionTitle: r.sectionTitle })), { includeAnchors })
      const includedParts = filteredParts.length
      if (!includedParts) {
        throw new Error('No parts left after applying label filters.')
      }

      const zip = new JSZip()

      for (const part of filteredParts) {
        if (exportMode !== 'blank' && part.templateContent.trim()) {
          zip.file(`template/${part.file}`, part.templateContent)
        }
        if (exportMode !== 'full' && part.blankContent.trim()) {
          zip.file(`blank-template/${part.file}`, part.blankContent)
        }
      }

      if (exportMode !== 'blank' && fetchedReadme?.content) {
        zip.file(`template/${fetchedReadme.file}`, fetchedReadme.content)
      }

      // Import additional files into blank template as declared in manifest
      if (exportMode !== 'full' && importGroups && importGroups.length) {
        const normalized = baseUrl.replace(/\/+$/, '')
        const results: Array<{ path: string; ok: boolean }> = []
        for (const group of importGroups) {
          const destInput = (group.destDir ?? '').trim()
          const dest = destInput === '.' ? '' : destInput.replace(/^[\/]+|[\/]+$/g, '')
          for (const rel of group.files) {
            const { urlPath, zipRel } = computeZipRel(group.srcDir, String(rel))
            const url = `${normalized}/${urlPath}`
            try {
              const res = await fetch(url)
              if (!res.ok) {
                results.push({ path: urlPath, ok: false })
                continue
              }
              const ab = await res.arrayBuffer()
              const finalRel = dest ? `${dest}/${zipRel}` : zipRel
              zip.file(`blank-template/${finalRel}`, ab)
              results.push({ path: urlPath, ok: true })
            } catch {
              results.push({ path: urlPath, ok: false })
            }
          }
        }
        const missing = results.filter(r => !r.ok).map(r => r.path)
        if (missing.length) {
          throw new Error(`Missing file(s) declared in manifest: ${missing.join(', ')}`)
        }
      }

      // Import additional files into resulting filtered template as declared in manifest
      if (exportMode !== 'blank' && templateImportGroups && templateImportGroups.length) {
        const normalized = baseUrl.replace(/\/+$/, '')
        const results: Array<{ path: string; ok: boolean }> = []
        for (const group of templateImportGroups) {
          const destInput = (group.destDir ?? '').trim()
          const dest = destInput === '.' ? '' : destInput.replace(/^[\/]+|[\/]+$/g, '')
          for (const rel of group.files) {
            const { urlPath, zipRel } = computeZipRel(group.srcDir, String(rel))
            const url = `${normalized}/${urlPath}`
            try {
              const res = await fetch(url)
              if (!res.ok) {
                results.push({ path: urlPath, ok: false })
                continue
              }
              const ab = await res.arrayBuffer()
              const finalRel = dest ? `${dest}/${zipRel}` : zipRel
              zip.file(`template/${finalRel}`, ab)
              results.push({ path: urlPath, ok: true })
            } catch {
              results.push({ path: urlPath, ok: false })
            }
          }
        }
        const missing = results.filter(r => !r.ok).map(r => r.path)
        if (missing.length) {
          throw new Error(`Missing file(s) declared in manifest (template): ${missing.join(', ')}`)
        }
      }

      const droppedSections = toDropMap(dropRules)

      // Only keep trace of disabled (unselected) labels
      const selectedSet = new Set(labelsToInclude)
      const disabledLabels = availableLabels.filter(l => !selectedSet.has(l))
      zip.file(
        'customization-context.yaml',
        stringify({
          generated_at: new Date().toISOString(),
          base_template_url: baseUrl,
          disabled_labels: disabledLabels,
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

  const refreshPreview = useCallback(async (overrideLabels?: string[]) => {
    const baseUrl = (templateUrl || DEFAULT_TEMPLATE_URL).trim()
    const labelsToInclude = overrideLabels ?? includingLabels.map(label => label.trim()).filter(Boolean)

    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const { filteredParts } = await loadFilteredPartsService(baseUrl, labelsToInclude, dropRules.map(r => ({ partFile: r.partFile, sectionTitle: r.sectionTitle })), { includeAnchors })
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
  }, [templateUrl, includingLabels, includeAnchors, dropRules])

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
      const disabledLabels = (ctx as any).disabled_labels ? ((ctx as any).disabled_labels as string[]).map(v => v.trim()).filter(Boolean) : []
      const dropped = ctx.dropped_sections ?? {}

      if (baseUrl) setTemplateUrl(baseUrl)
      // Mark we loaded from context to avoid auto-select re-triggering unexpectedly
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
      if (disabledLabels.length) {
        // First load to get selectable labels, then compute included = selectable - disabled
        const { selectableLabels } = await loadFilteredPartsService(effectiveBase, [], [], { includeAnchors })
        const disabledSet = new Set(disabledLabels)
        const included = selectableLabels.filter(l => !disabledSet.has(l))
        setIncludingLabels(included)
        // Load again with the computed included labels to reflect in preview and state
        await handleLoadTemplate(effectiveBase)
        lastLoadedBaseUrlRef.current = effectiveBase
        if (previewOpen) await refreshPreview(included)
      } else {
        // Backward compat: context with selected_labels
        setIncludingLabels(loadedLabels)
        await handleLoadTemplate(effectiveBase)
        lastLoadedBaseUrlRef.current = effectiveBase
        if (previewOpen) await refreshPreview()
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErrorMessage(`Failed to load customization-context.yaml: ${msg}`)
    } finally {
      // reset input value so the same file can be selected again if needed
      if (contextFileInputRef.current) contextFileInputRef.current.value = ''
    }
  }

  const partSelectRefs = useRef<Record<string, HTMLSelectElement | null>>({})

  const handleAddDropRule = () => {
    const newRule = { id: String(Date.now() + Math.random()), partFile: '', sectionTitle: '' }
    setDropRules(prev => [...prev, newRule])
    setLastAddedRuleId(newRule.id)
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

  // When a rule is added: scroll into view, flash highlight, and auto-open combobox
  useEffect(() => {
    if (!lastAddedRuleId) return
    const row = ruleRowRefs.current[lastAddedRuleId]
    if (row) {
      try { row.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) } catch { /* no-op */ }
      setFlashRuleIds(prev => ({ ...prev, [lastAddedRuleId]: true }))
      window.setTimeout(() => {
        setFlashRuleIds(prev => { const next = { ...prev }; delete next[lastAddedRuleId]; return next })
      }, 1500)
    }
    // Focus the Part selector for the newly added rule
    const sel = partSelectRefs.current[lastAddedRuleId]
    try { sel?.focus() } catch { /* no-op */ }
  }, [lastAddedRuleId])

  // Auto-refresh preview when options affecting preview change and preview is open
  useEffect(() => {
    if (!previewOpen) return
    void refreshPreview()
  }, [previewOpen, refreshPreview])

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
                  const parts = label.split('::', 2)
                  const isMulti = parts.length === 2
                  if (isMulti) {
                    const [name, value] = parts
                    return (
                      <li
                        key={label}
                        onClick={() => { void handleAvailableLabelClick(label) }}
                        className={isSelected ? 'label-chip multi selected' : 'label-chip multi'}
                        title={label}
                      >
                        <span className="chip-seg chip-seg--name">{name}</span>
                        <span className="chip-seg chip-seg--value">{value}</span>
                      </li>
                    )
                  }
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
            <h3>🧹 Drop specific sections (optional) <span className="muted">({dropRules.length})</span></h3>
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
                    const treeItems = availableSectionsTreeByPart[rule.partFile] ?? []
                    return (
                      <tr key={rule.id} ref={el => { ruleRowRefs.current[rule.id] = el }} className={flashRuleIds[rule.id] ? 'row-flash' : undefined}>
                        <td>
                          <select
                            value={rule.partFile}
                            onChange={e => handleChangeRulePart(rule.id, e.target.value)}
                            ref={el => { partSelectRefs.current[rule.id] = el }}
                          >
                            {(!rule.partFile) ? (
                              <option value="" disabled>Select a part</option>
                            ) : null}
                            {parts.map(file => (
                              <option key={file} value={file}>
                                {partNamesByFile[file] ?? file}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="section-cell">
                          <SectionTreeCombo
                            items={treeItems}
                            value={rule.sectionTitle}
                            onChange={(val) => handleChangeRuleTitle(rule.id, val)}
                            autoFocus={false}
                            defaultOpen={false}
                            disabled={!rule.partFile}
                            onCommit={() => { try { generateBtnRef.current?.focus() } catch { /* no-op */ } }}
                            placeholder="Type or pick a section title"
                          />
                        </td>
                        <td className="drop-actions">
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
            {templateLoadInfo.state !== 'loaded' && !previewOpen ? (
              <span className="disabled-hint">Load a base template to enable preview</span>
            ) : null}
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
            <div className="output-mode" style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span>Output:</span>
              <label className="radio">
                <input
                  type="radio"
                  name="output-mode"
                  value="blank"
                  checked={exportMode === 'blank'}
                  onChange={() => setExportMode('blank')}
                />
                <span>Blank only</span>
              </label>
              <label className="radio">
                <input
                  type="radio"
                  name="output-mode"
                  value="full"
                  checked={exportMode === 'full'}
                  onChange={() => setExportMode('full')}
                />
                <span>Template only</span>
              </label>
              <label className="radio">
                <input
                  type="radio"
                  name="output-mode"
                  value="both"
                  checked={exportMode === 'both'}
                  onChange={() => setExportMode('both')}
                />
                <span>Both</span>
              </label>              
            </div>
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
                  const showBlank = exportMode !== 'full'
                  const showFull = exportMode !== 'blank'
                  return (
                    <div key={part.file} className="preview-view">
                      <h4>
                        {part.name}
                        <span className="preview-file"> ({part.file})</span>
                      </h4>
                      <div className="preview-sections">
                        {showBlank ? (
                          <details
                            open={state.blank}
                            onToggle={event =>
                              handleSectionToggle(part.file, 'blank', (event.target as HTMLDetailsElement).open)
                            }
                          >
                            <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <span>Blank template</span>
                              <button
                                type="button"
                                className="secondary-action icon-only"
                                title={copyStatus[`${part.file}::blank`] === 'copied' ? 'Copied!' : copyStatus[`${part.file}::blank`] === 'error' ? 'Copy failed' : 'Copy content'}
                                aria-label="Copy blank content"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); void copyToClipboard(`${part.file}::blank`, part.blankContent) }}
                                disabled={!part.blankContent.trim()}
                              >
                                📋
                              </button>
                            </summary>
                            <pre>{part.blankContent.trim() ? part.blankContent : '(blank)'}</pre>
                          </details>
                        ) : null}
                        {showFull ? (
                          <details
                            open={state.full}
                            onToggle={event =>
                              handleSectionToggle(part.file, 'full', (event.target as HTMLDetailsElement).open)
                            }
                          >
                            <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <span>Filtered template</span>
                              <button
                                type="button"
                                className="secondary-action icon-only"
                                title={copyStatus[`${part.file}::full`] === 'copied' ? 'Copied!' : copyStatus[`${part.file}::full`] === 'error' ? 'Copy failed' : 'Copy content'}
                                aria-label="Copy filtered content"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); void copyToClipboard(`${part.file}::full`, part.templateContent) }}
                                disabled={!part.templateContent.trim()}
                              >
                                📋
                              </button>
                            </summary>
                            <pre>{part.templateContent.trim() ? part.templateContent : '(blank)'}</pre>
                          </details>
                        ) : null}
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
          ref={generateBtnRef}
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
        Full documentation and more in the <a href="https://github.com/bflorat/document-template-customizer" target="_blank" rel="noreferrer">
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


// toDropMap moved to utils/dropRules

type SectionItem = { title: string; level: number }

function SectionTreeCombo({ items, value, onChange, placeholder, autoFocus, defaultOpen, onCommit, disabled }: {
  items: SectionItem[]
  value: string
  onChange: (val: string) => void
  placeholder?: string
  autoFocus?: boolean
  defaultOpen?: boolean
  onCommit?: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  const [query, setQuery] = useState(value)
  const ref = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      try { inputRef.current.focus() } catch { /* no-op */ }
      setOpen(true)
    }
  }, [autoFocus])

  const norm = (s: string) => s.toLowerCase()
  const q = norm(query.trim())
  const filtered = q ? items.filter(i => norm(i.title).includes(q)) : items

  return (
    <div className={`combo${disabled ? ' combo--disabled' : ''}`} ref={ref}>
      <input
        type="text"
        className="combo-input"
        value={query}
        onChange={e => { if (disabled) return; setQuery(e.target.value); onChange(e.target.value) }}
        onFocus={() => { if (disabled) return; setOpen(true) }}
        onKeyDown={e => {
          if (disabled) return
          if (e.key === 'Escape') { setOpen(false); return }
          if (e.key === 'Enter') {
            if (filtered.length > 0) {
              const next = filtered[0].title
              setQuery(next)
              onChange(next)
              setOpen(false)
              onCommit?.()
              e.preventDefault()
            }
          }
        }}
        placeholder={placeholder}
        ref={inputRef}
        disabled={!!disabled}
      />
      {open && filtered.length > 0 ? (
        <div className="combo-dropdown">
          {filtered.map((item, idx) => (
            <div
              key={`${item.title}-${idx}`}
              className="combo-item"
              style={{ paddingLeft: Math.max(0, item.level - 1) * 12 + 8 }}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { setQuery(item.title); onChange(item.title); setOpen(false); onCommit?.() }}
              title={item.title}
            >
              {item.title}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
