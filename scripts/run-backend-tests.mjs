import fs from "node:fs/promises"
import path from "node:path"
import { spawnSync } from "node:child_process"
import ts from "typescript"

const rootDir = process.cwd()
const testsDir = path.join(rootDir, "tests", "backend")
const outRootDir = path.join(rootDir, ".tmp")

async function collectTestEntries(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectTestEntries(fullPath)))
      continue
    }

    if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(fullPath)
    }
  }

  return files.sort((a, b) => a.localeCompare(b))
}

async function tryResolveLocalImport(importerPath, specifier) {
  if (!specifier.startsWith(".")) {
    return null
  }

  const importerDir = path.dirname(importerPath)
  const basePath = path.resolve(importerDir, specifier)
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.mts`,
    `${basePath}.cts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.mts"),
    path.join(basePath, "index.cts"),
    path.join(basePath, "index.tsx"),
  ]

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate)
      if (stat.isFile()) {
        return path.normalize(candidate)
      }
    } catch {
      // Continue checking the next candidate.
    }
  }

  return null
}

async function transpileClosure(entryFiles, outDir) {
  const queue = [...entryFiles]
  const visited = new Set()

  while (queue.length > 0) {
    const filePath = queue.pop()
    if (!filePath || visited.has(filePath)) {
      continue
    }

    visited.add(filePath)
    const source = await fs.readFile(filePath, "utf8")

    const transpiled = ts.transpileModule(source, {
      fileName: filePath,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        esModuleInterop: true,
        isolatedModules: true,
      },
      reportDiagnostics: true,
    })

    if (transpiled.diagnostics?.length) {
      const fatalDiagnostics = transpiled.diagnostics.filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      )
      if (fatalDiagnostics.length > 0) {
        const formatted = ts.formatDiagnosticsWithColorAndContext(fatalDiagnostics, {
          getCanonicalFileName: (name) => name,
          getCurrentDirectory: () => rootDir,
          getNewLine: () => "\n",
        })
        throw new Error(formatted)
      }
    }

    const relativePath = path.relative(rootDir, filePath)
    const outputPath = path
      .join(outDir, relativePath)
      .replace(/\.tsx?$/i, ".js")
      .replace(/\.mts$/i, ".mjs")
      .replace(/\.cts$/i, ".cjs")

    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, transpiled.outputText, "utf8")

    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue
      }

      const specifier = statement.moduleSpecifier.text
      const resolved = await tryResolveLocalImport(filePath, specifier)
      if (resolved && !visited.has(resolved)) {
        queue.push(resolved)
      }
    }
  }
}

async function main() {
  const outDir = path.join(rootDir, ".tmp", `backend-tests-${Date.now()}`)
  const testEntries = await collectTestEntries(testsDir)
  if (testEntries.length === 0) {
    throw new Error("No backend tests found in tests/backend/*.test.ts")
  }

  await fs.mkdir(outRootDir, { recursive: true })
  await fs.mkdir(outDir, { recursive: true })
  await fs.writeFile(path.join(outDir, "package.json"), '{"type":"commonjs"}\n', "utf8")

  await transpileClosure(testEntries, outDir)

  const compiledTestEntries = testEntries.map((entry) => {
    const relativePath = path.relative(rootDir, entry)
    return path.join(outDir, relativePath).replace(/\.ts$/i, ".js")
  })

  const runnerFilePath = path.join(outDir, "run-backend-tests.cjs")
  const runnerSource = compiledTestEntries
    .map((filePath) => `require(${JSON.stringify(filePath)});`)
    .join("\n")
  await fs.writeFile(runnerFilePath, `${runnerSource}\n`, "utf8")

  const result = spawnSync(process.execPath, [runnerFilePath], {
    cwd: rootDir,
    stdio: "inherit",
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
