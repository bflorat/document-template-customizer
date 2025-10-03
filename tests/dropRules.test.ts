import { describe, it, expect } from 'vitest'
import { toDropMap } from '../src/utils/dropRules'

describe('toDropMap', () => {
  it('groups titles by part and trims/ignores empty', () => {
    const map = toDropMap([
      { partFile: 'a.adoc', sectionTitle: ' Intro ' },
      { partFile: 'a.adoc', sectionTitle: 'Intro' }, // duplicate
      { partFile: 'b.adoc', sectionTitle: 'Overview' },
      { partFile: '', sectionTitle: 'X' }, // ignored
      { partFile: 'c.adoc', sectionTitle: '   ' }, // ignored
    ])

    expect(Object.keys(map)).toEqual(['a.adoc', 'b.adoc'])
    expect(map['a.adoc']).toEqual(['Intro'])
    expect(map['b.adoc']).toEqual(['Overview'])
  })
})

