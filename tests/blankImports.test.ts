import { describe, it, expect } from 'vitest'
import { computeZipRel } from '../src/utils/blankImports'

describe('blank imports path mapping', () => {
  it('maps base_dir root to zip root', () => {
    const { urlPath, zipRel } = computeZipRel('blank-template', 'README.adoc')
    expect(urlPath).toBe('blank-template/README.adoc')
    expect(zipRel).toBe('README.adoc')
  })

  it('urlPath keeps base_dir; zipRel is relative to src_dir', () => {
    const { urlPath, zipRel } = computeZipRel('blank-template/resources', 'views.png')
    expect(urlPath).toBe('blank-template/resources/views.png')
    expect(zipRel).toBe('views.png')
  })

  it('handles deeper base_dir with nested files (zipRel keeps file path only)', () => {
    const { urlPath, zipRel } = computeZipRel('top/a/b', 'c/d.txt')
    expect(urlPath).toBe('top/a/b/c/d.txt')
    expect(zipRel).toBe('c/d.txt')
  })

  it('treats base_dir "." as repository root', () => {
    const { urlPath, zipRel } = computeZipRel('.', 'LICENSE.md')
    expect(urlPath).toBe('LICENSE.md')
    expect(zipRel).toBe('LICENSE.md')
  })
})
