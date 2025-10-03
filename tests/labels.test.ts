import { describe, it, expect } from 'vitest'
import { buildAvailableSections, buildAvailableSectionsTreeList } from '../src/utils/labels'
import type { TemplateWithParts } from '../src/model/TemplateWithParts'
import type { PartSection } from '../src/model/PartSection'

function section(title: string, level: number, children: PartSection[] = []): PartSection {
  return { title, level, children }
}

function makeTemplateWith(parts: Array<{ file: string; name?: string; sections: PartSection[] }>): TemplateWithParts {
  return {
    metadata: {
      url: 'about:blank',
      raw: '',
      data: {
        author: 'test',
        license: 'MIT',
        parts: parts.map(p => ({ name: p.name ?? p.file, file: p.file })),
      },
    },
    parts: parts.map(p => ({
      name: p.name ?? p.file,
      file: p.file,
      url: undefined,
      content: '',
      sections: p.sections,
    })),
    readme: { file: 'README.adoc', content: '' },
  }
}

describe('labels utils - available sections', () => {
  it('buildAvailableSections returns titles per part', () => {
    const tpl = makeTemplateWith([
      {
        file: 'a.adoc',
        sections: [
          section('A', 1, [
            section('A1', 2),
            section('A2', 2, [section('A2.1', 3)]),
          ]),
        ],
      },
      { file: 'b.adoc', sections: [section('B', 1)] },
    ])

    const flat = buildAvailableSections(tpl)
    expect(Object.keys(flat)).toContain('a.adoc')
    expect(Object.keys(flat)).toContain('b.adoc')
    expect(flat['a.adoc']).toEqual(expect.arrayContaining(['A', 'A1', 'A2', 'A2.1']))
    expect(flat['b.adoc']).toEqual(['B'])
  })

  it('buildAvailableSectionsTreeList preserves order and levels', () => {
    const tpl = makeTemplateWith([
      {
        file: 'a.adoc',
        sections: [
          section('Parent', 1, [
            section('Child 1', 2),
            section('Child 2', 2, [section('Grandchild', 3)]),
          ]),
        ],
      },
    ])

    const tree = buildAvailableSectionsTreeList(tpl)
    const items = tree['a.adoc']
    expect(items.map(i => i.title)).toEqual(['Parent', 'Child 1', 'Child 2', 'Grandchild'])
    expect(items.map(i => i.level)).toEqual([1, 2, 2, 3])
  })
})

