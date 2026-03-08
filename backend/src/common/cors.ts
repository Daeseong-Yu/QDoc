const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173']

function normalizeOrigins(raw: string) {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export function parseAllowedOrigins(value?: string) {
  const raw = value?.trim()
  if (!raw) {
    return DEFAULT_ALLOWED_ORIGINS
  }

  const origins = normalizeOrigins(raw)
  if (origins.length === 0) {
    return DEFAULT_ALLOWED_ORIGINS
  }

  if (origins.includes('*')) {
    throw new Error('CORS_ORIGIN wildcard "*" is not allowed. Use explicit origin list.')
  }

  return Array.from(new Set(origins))
}
