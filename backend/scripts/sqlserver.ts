import 'dotenv/config'
import { spawnSync } from 'node:child_process'

type ConnectionConfig = {
  database: string
  server: string
  user: string
  password: string
  trustServerCertificate: boolean
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set.')
  }

  return databaseUrl
}

function parseDatabaseUrl(databaseUrl: string): ConnectionConfig {
  const match = databaseUrl.match(/^sqlserver:\/\/([^;]+)(.*)$/i)

  if (!match) {
    throw new Error('DATABASE_URL must start with sqlserver://')
  }

  const serverPart = match[1]
  const parameterPart = match[2] ?? ''
  const parameterMap = new Map<string, string>()

  for (const segment of parameterPart.split(';')) {
    if (!segment) {
      continue
    }

    const separatorIndex = segment.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const key = segment.slice(0, separatorIndex).trim().toLowerCase()
    const value = segment.slice(separatorIndex + 1).trim()
    parameterMap.set(key, value)
  }

  const [host, port] = serverPart.split(':')
  const database = parameterMap.get('database')
  const user = parameterMap.get('user')
  const password = parameterMap.get('password')

  if (!host || !database || !user || !password) {
    throw new Error('DATABASE_URL must include host, database, user, and password values.')
  }

  return {
    database,
    server: port ? `${host},${port}` : host,
    user,
    password,
    trustServerCertificate: parameterMap.get('trustservercertificate')?.toLowerCase() === 'true',
  }
}

export function getDatabaseName() {
  return parseDatabaseUrl(getDatabaseUrl()).database
}

export function runSql(sql: string, databaseOverride?: string) {
  const config = parseDatabaseUrl(getDatabaseUrl())
  const args = ['-S', config.server, '-U', config.user, '-P', config.password, '-b', '-l', '30', '-d', databaseOverride ?? config.database, '-Q', sql]

  if (config.trustServerCertificate) {
    args.splice(9, 0, '-C')
  }

  const result = spawnSync('sqlcmd', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.error) {
    throw result.error
  }

  if (result.stdout) {
    process.stdout.write(result.stdout)
  }

  if (result.stderr) {
    process.stderr.write(result.stderr)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

