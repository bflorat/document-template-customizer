import { describe, it, expect } from 'vitest'
import { buildFilteredPartsFromResult, buildKnownLabelSet } from '../src/generateFilteredParts'
import type { TemplateWithParts, PartSection } from '../src/model'

function mkSections1(): PartSection[] {
  return [
    {
      level: 1,
      title: 'Part1',
      children: [
        {
          level: 2,
          title: 'A',
          children: [],
          metadata: { id: 's1' },
        },
      ],
    },
  ]
}

function mkSections2(): PartSection[] {
  return [
    {
      level: 1,
      title: 'Part2',
      children: [
        {
          level: 2,
          title: 'B',
          children: [],
          metadata: { id: 's2', linkTo: ['s1'] },
        },
      ],
    },
  ]
}

describe('buildFilteredPartsFromResult', () => {
  const p1Content = `# Part1\n\n//🏷{"id":"s1"}\n## A\nA body\n`
  const p2Content = `# Part2\n\n//🏷{"id":"s2","link_to":["s1"]}\n## B\nB body\n`

  const tpl: TemplateWithParts = {
    metadata: {
      url: 'base-template-manifest.yaml',
      raw: 'raw',
      data: {
        author: 'X',
        license: 'MIT',
        language: 'fr',
        parts: [
          { name: 'Part 2', file: 'p2.adoc' },
          { name: 'Part 1', file: 'p1.adoc' },
        ],
      },
    },
    parts: [
      { name: 'Part 1', file: 'p1.adoc', url: 'base/p1.adoc', content: p1Content, sections: mkSections1() },
      { name: 'Part 2', file: 'p2.adoc', url: 'base/p2.adoc', content: p2Content, sections: mkSections2() },
    ],
    readme: { file: 'README.adoc', content: '= Readme' },
  }

  it('orders parts by manifest order and localizes See also', () => {
    const known = buildKnownLabelSet(tpl)
    const filtered = buildFilteredPartsFromResult(tpl, [], known, undefined, { includeAnchors: false })
    expect(filtered.length).toBe(2)
    // Parts follow manifest order (p2 then p1)
    expect(filtered[0].file).toBe('p2.adoc')
    expect(filtered[1].file).toBe('p1.adoc')
    // Localized See also (French), cross-doc xref since s1 is in p1.adoc
    expect(filtered[0].templateContent).toContain('TIP: Voir aussi xref:p1.adoc#s1[A].')
    expect(filtered[0].blankContent).toContain('TIP: Voir aussi xref:p1.adoc#s1[A].')
    // No anchors when includeAnchors=false
    expect(filtered[0].templateContent).not.toContain('[#s1]')
    expect(filtered[1].templateContent).not.toContain('[#s1]')
  })

  it('throws on unknown selected labels', () => {
    const known = buildKnownLabelSet(tpl)
    expect(() => buildFilteredPartsFromResult(tpl, ['unknown'], known)).toThrow(/Unknown label\(s\): unknown/)
  })

  it('includes anchors when includeAnchors=true', () => {
    const known = buildKnownLabelSet(tpl)
    const filtered = buildFilteredPartsFromResult(tpl, [], known, undefined, { includeAnchors: true })
    // Anchor for s1 appears in part1 content
    const p1 = filtered.find(p => p.file === 'p1.adoc')!
    expect(p1.templateContent).toContain('[#s1]')
  })
})
