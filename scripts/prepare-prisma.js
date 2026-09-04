import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schemaPath = path.resolve(__dirname, "../prisma/schema.prisma")

// 1. Check CLI args: e.g. "node scripts/prepare-prisma.js postgresql"
const cliArg = process.argv[2]?.toLowerCase()

// 2. Check explicit env: DB_PROVIDER="postgresql" or "mysql"
const explicitProvider = process.env.DB_PROVIDER?.toLowerCase()

// 3. Inspect DATABASE_URL protocol
const dbUrl = (process.env.DATABASE_URL || "").trim().toLowerCase()

let targetProvider = ""

if (cliArg === "postgres" || cliArg === "postgresql") {
  targetProvider = "postgresql"
} else if (cliArg === "mysql") {
  targetProvider = "mysql"
} else if (explicitProvider === "postgres" || explicitProvider === "postgresql") {
  targetProvider = "postgresql"
} else if (explicitProvider === "mysql") {
  targetProvider = "mysql"
} else if (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://")) {
  targetProvider = "postgresql"
} else if (dbUrl.startsWith("mysql://")) {
  targetProvider = "mysql"
}

if (!fs.existsSync(schemaPath)) {
  console.error(`[prepare-prisma] schema.prisma not found at ${schemaPath}`)
  process.exit(0)
}

let schema = fs.readFileSync(schemaPath, "utf-8")
const currentMatch = schema.match(/provider\s*=\s*"(mysql|postgresql)"/)
const currentProvider = currentMatch ? currentMatch[1] : null

// If no target was detected, keep the current provider
if (!targetProvider) {
  targetProvider = currentProvider || "mysql"
}

if (currentProvider !== targetProvider) {
  const updated = schema.replace(
    /datasource\s+db\s*\{[\s\S]*?provider\s*=\s*"(mysql|postgresql)"/m,
    (match) => match.replace(/"(mysql|postgresql)"/, `"${targetProvider}"`)
  )
  fs.writeFileSync(schemaPath, updated, "utf-8")
  console.log(`[prepare-prisma] Switched Prisma provider from "${currentProvider}" to "${targetProvider}"`)
} else {
  console.log(`[prepare-prisma] Prisma provider is already "${targetProvider}"`)
}
