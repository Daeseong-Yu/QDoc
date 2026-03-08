import { networkInterfaces } from 'node:os'

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173']
const DEV_FRONTEND_PORTS = ['4173', '5173', '5174', '5175', '5176', '5177', '5178', '5179', '5180']
const DEV_LOCAL_HOSTS = ['localhost', '127.0.0.1']

function normalizeOrigins(raw: string) {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function getLanHosts() {
  const hosts = new Set<string>()

  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        hosts.add(entry.address)
      }
    }
  }

  return Array.from(hosts)
}

function getDevelopmentOrigins() {
  const hosts = [...DEV_LOCAL_HOSTS, ...getLanHosts()]
  const origins: string[] = []

  for (const host of hosts) {
    for (const port of DEV_FRONTEND_PORTS) {
      origins.push(`http://${host}:${port}`)
    }
  }

  return origins
}

export function parseAllowedOrigins(value?: string, nodeEnv?: string) {
  const raw = value?.trim()
  const configuredOrigins = raw ? normalizeOrigins(raw) : []
  const origins = configuredOrigins.length > 0 ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS

  if (origins.includes('*')) {
    throw new Error('CORS_ORIGIN wildcard "*" is not allowed. Use explicit origin list.')
  }

  if ((nodeEnv ?? '').toLowerCase() === 'production') {
    return Array.from(new Set(origins))
  }

  return Array.from(new Set([...getDevelopmentOrigins(), ...origins]))
}

