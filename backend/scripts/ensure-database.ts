import { getDatabaseName, runSql } from './sqlserver'

function escapeSqlLiteral(value: string) {
  return value.replace(/'/g, "''")
}

function escapeSqlIdentifier(value: string) {
  return value.replace(/]/g, ']]')
}

const databaseName = getDatabaseName()
const databaseLiteral = escapeSqlLiteral(databaseName)
const sql = `
IF DB_ID(N'${databaseLiteral}') IS NULL
BEGIN
  CREATE DATABASE [${escapeSqlIdentifier(databaseName)}];
END;

IF HAS_DBACCESS(N'${databaseLiteral}') <> 1
BEGIN
  RAISERROR(N'Login does not have access to database ${databaseLiteral}. Grant database access for this login before running db:reset.', 16, 1);
  RETURN;
END;
`

runSql(sql, 'master')
console.log(`Database ensured: ${databaseName}`)
