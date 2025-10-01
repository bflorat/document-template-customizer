import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TemplateWithParts, TemplateManifest } from '../src/model'

// Mock the fetchTemplateAndParts used by the service to avoid network
vi.mock('../src/fetchTemplateManifest', () => {
  return {
    fetchTemplateAndParts: async (baseUrl: string): Promise<TemplateWithParts> => {
      const manifest: TemplateManifest = {
        author: 'ACME',
        license: 'CC',
        parts: [
          { name: 'Application', file: 'view-application.adoc' },
        ],
        labels: [ { name: 'level', available_values: ['basic', 'advanced'] } ],
        language: 'en',
        files_imports: [ { src_dir: 'blank-templates', files: ['README.adoc', 'assets/a.png'] } ],
        files_imports_templates: [ { src_dir: 'template-assets', files: ['css/main.css'] } ],
      }

      const content = [
        '//🏷{"id":"id-app","labels":["foo"]}',
        '# Application',
        '',
        'Some text kept in template; blank omits body by default.',
        '',
        '//🏷{"id":"id-child"}',
        '## Child',
        'Details',
        '',
      ].join('\n')

      const parts: TemplateWithParts['parts'] = [
        {
          name: 'Application',
          file: 'view-application.adoc',
          url: `${baseUrl}/view-application.adoc`,
          content,
          sections: [
            {
              level: 1,
              title: 'Application',
              metadata: { id: 'id-app', labels: ['foo'] },
              children: [
                { level: 2, title: 'Child', metadata: { id: 'id-child' }, children: [] },
              ],
            },
          ],
        },
      ]

      return {
        metadata: { url: `${baseUrl}/base-template-manifest.yaml`, raw: 'raw', data: manifest },
        parts,
        readme: { file: 'README.adoc', content: '# Readme' },
      }
    },
  }
})

import { loadFilteredParts } from '../src/services/loadFilteredParts'

describe('loadFilteredParts service', () => {
  const BASE = 'https://example.test/base'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('computes labels, sections, part names and import groups', async () => {
    const res = await loadFilteredParts(BASE, [], [], { includeAnchors: true })

    // Labels: discovered single 'foo' + multi-values from manifest
    expect(res.selectableLabels).toContain('foo')
    expect(res.selectableLabels).toContain('level::basic')
    expect(res.selectableLabels).toContain('level::advanced')

    // Sections map
    expect(Object.keys(res.availableSectionsByPart)).toContain('view-application.adoc')
    expect(res.availableSectionsByPart['view-application.adoc']).toContain('Application')
    expect(res.availableSectionsByPart['view-application.adoc']).toContain('Child')

    // Part names map
    expect(res.partNamesByFile['view-application.adoc']).toBe('Application')

    // Import groups
    expect(res.importGroups).toEqual([
      { srcDir: 'blank-templates', destDir: undefined, files: ['README.adoc', 'assets/a.png'] },
    ])
    expect(res.templateImportGroups).toEqual([
      { srcDir: 'template-assets', destDir: undefined, files: ['css/main.css'] },
    ])

    // Filtered parts produced, at least one with content
    expect(res.filteredParts.length).toBe(1)
    expect(res.filteredParts[0].file).toBe('view-application.adoc')
    expect(res.filteredParts[0].templateContent).toContain('# Application')
  })

  it('applies dropRules to remove sections by title', async () => {
    const res = await loadFilteredParts(BASE, [], [{ partFile: 'view-application.adoc', sectionTitle: 'Child' }], { includeAnchors: true })
    // The template content should not include the dropped subsection title
    expect(res.filteredParts[0].templateContent).not.toMatch(/^##\s+Child/m)
  })

  it('respects includeAnchors=false to omit inserted anchors', async () => {
    // With anchors enabled (default), expect AsciiDoc block IDs inserted
    const withAnchors = await loadFilteredParts(BASE, [], [], { includeAnchors: true })
    expect(withAnchors.filteredParts[0].templateContent).toMatch(/\[#id-app\]/)
    expect(withAnchors.filteredParts[0].templateContent).toMatch(/\[#id-child\]/)

    // With anchors disabled, they should be absent
    const withoutAnchors = await loadFilteredParts(BASE, [], [], { includeAnchors: false })
    expect(withoutAnchors.filteredParts[0].templateContent).not.toMatch(/\[#id-app\]/)
    expect(withoutAnchors.filteredParts[0].templateContent).not.toMatch(/\[#id-child\]/)
  })

  it('throws on unknown labels', async () => {
    await expect(loadFilteredParts(BASE, ['does-not-exist'], [], { includeAnchors: true }))
      .rejects
      .toThrow(/Unknown label\(s\): does-not-exist/)
  })
})
