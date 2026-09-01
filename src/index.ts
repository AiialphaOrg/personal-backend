import { createApp } from "./app.js"
import { logger } from "./lib/logger.js"
import { prisma } from "./lib/prisma.js"

const port = Number(process.env.PORT || 4000)

async function main() {
  const app = createApp()
  app.listen(port, () => {
    logger.info(`Personal OS API listening on http://localhost:${port}`)
  })
}

main().catch(async (err) => {
  logger.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
