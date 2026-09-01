import express from "express"
import cors from "cors"
import { requestLogger } from "./middleware/request-logger.js"
import { quotesRouter } from "./routes/quotes.js"
import { syncRouter } from "./routes/sync.js"
import { authRouter } from "./routes/auth.js"
import { dataRouter } from "./routes/data.js"
import { errorHandler, notFound } from "./middleware/error.js"

export function createApp() {
  const app = express()

  // Full CORS configuration with preflight support
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow all origins (including undefined for same-origin or tools)
        callback(null, true)
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
      allowedHeaders: [
        "Origin",
        "X-Requested-With",
        "Content-Type",
        "Accept",
        "Authorization",
        "X-Api-Version",
        "X-CSRF-Token",
      ],
      exposedHeaders: ["Content-Length", "X-Kuma-Revision"],
      maxAge: 86400,
    })
  )

  // Explicitly respond to preflight OPTIONS for any route
  app.options("*", cors())

  app.use(express.json({ limit: "1mb" }))
  app.use(requestLogger)


  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "personalos-api" })
  })

  app.use("/api/quotes", quotesRouter)
  app.use("/api/sync", syncRouter)
  app.use("/api/auth", authRouter)
  app.use("/api/data", dataRouter)

  app.use(notFound)
  app.use(errorHandler)
  return app
}
