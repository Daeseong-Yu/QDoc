import { getDatabaseName, runSql } from './sqlserver'

function escapeSqlLiteral(value: string) {
  return value.replace(/'/g, "''")
}

function escapeSqlIdentifier(value: string) {
  return value.replace(/]/g, ']]')
}

const databaseName = getDatabaseName()
const databaseLiteral = escapeSqlLiteral(databaseName)
const databaseIdentifier = escapeSqlIdentifier(databaseName)
const sql = `
IF DB_ID(N'${databaseLiteral}') IS NULL
BEGIN
  RAISERROR(N'Database ${databaseLiteral} does not exist.', 16, 1);
  RETURN;
END;

EXEC(N'
USE [${databaseIdentifier}];
IF OBJECT_ID(N''dbo.usp_SendRank3Alert'', N''P'') IS NOT NULL DROP PROCEDURE dbo.usp_SendRank3Alert;
IF OBJECT_ID(N''dbo.usp_JoinQueue'', N''P'') IS NOT NULL DROP PROCEDURE dbo.usp_JoinQueue;
IF OBJECT_ID(N''dbo.Notifications'', N''U'') IS NOT NULL DROP TABLE dbo.Notifications;
IF OBJECT_ID(N''dbo.PatientQueue'', N''U'') IS NOT NULL DROP TABLE dbo.PatientQueue;
IF OBJECT_ID(N''dbo.Clinics'', N''U'') IS NOT NULL DROP TABLE dbo.Clinics;
');
`

runSql(sql, 'master')
console.log('Database objects wiped.')
