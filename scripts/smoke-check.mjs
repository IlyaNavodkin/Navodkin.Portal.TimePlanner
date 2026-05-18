import fs from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const rootDir = process.cwd()

const filesToCheck = [
  "nuxt.config.ts",
  "tailwind.config.ts",
  "features/timeline/types.ts",
  "composables/useApiDataComposable.ts",
  "composables/useTimelinePlanner.ts",
  "services/api/timeline.api.ts",
]

function formatDiagnostic(filePath, diagnostic) {
  const position = diagnostic.start ?? 0
  const location = diagnostic.file?.getLineAndCharacterOfPosition(position)
  const line = location ? location.line + 1 : 1
  const column = location ? location.character + 1 : 1
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  return `${filePath}:${line}:${column} ${message}`
}

async function checkFile(relativePath) {
  const absolutePath = path.join(rootDir, relativePath)
  const sourceText = await fs.readFile(absolutePath, "utf8")

  const sourceFile = ts.createSourceFile(
    absolutePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )

  return sourceFile.parseDiagnostics.map((diagnostic) => formatDiagnostic(relativePath, diagnostic))
}

async function main() {
  const allDiagnostics = []

  for (const relativePath of filesToCheck) {
    const diagnostics = await checkFile(relativePath)
    allDiagnostics.push(...diagnostics)
  }

  if (allDiagnostics.length > 0) {
    for (const diagnostic of allDiagnostics) {
      console.error(diagnostic)
    }
    process.exit(1)
  }

  console.log(`Frontend smoke-check passed: ${filesToCheck.length} TS files parsed successfully.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
