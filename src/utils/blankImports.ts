export function normalizeBaseDir(baseDir: string): string {
  const s = String(baseDir || '').trim().replace(/\/+$/, '').replace(/^\/+/, '')
  // Treat "." as repository root
  if (s === '.' || s === './') return ''
  return s
}

export function computeZipRel(baseDir: string, relPath: string): { urlPath: string; zipRel: string } {
  const base = normalizeBaseDir(baseDir)
  const path = String(relPath || '').trim().replace(/^\/+/, '')
  const urlPath = base ? `${base}/${path}` : path
  const baseSuffix = base.split('/').filter(Boolean).slice(1).join('/')
  const zipRel = baseSuffix ? `${baseSuffix}/${path}` : path
  return { urlPath, zipRel }
}
