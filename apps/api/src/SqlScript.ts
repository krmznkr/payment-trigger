/** Splits a migration-style SQL file into statements. Our files have no `;` inside literals or comments. */
export const sqlStatements = (script: string): ReadonlyArray<string> =>
  script
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
