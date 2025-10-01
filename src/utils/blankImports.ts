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
  // With explicit dest_dir in manifest, output path inside zip should only
  // reflect relPath; dest_dir is applied by the caller.
  const zipRel = path
  return { urlPath, zipRel }
}
