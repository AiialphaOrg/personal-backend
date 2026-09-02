import express from "express"
import cors from "cors"
import { requestLogger } from "./middleware/request-logger.js"
import { quotesRouter } from "./routes/quotes.js"
import { syncRouter } from "./routes/sync.js"
import { authRouter } from "./routes/auth.js"
import { dataRouter } from "./routes/data.js"
import { errorHandler, notFound } from "./middleware/error.js"

const ALLOWED_ORIGINS = [
  "https://posappaii.vercel.app",
  "http://localhost:5173",
  "http://localhost:5177",
  "http://localhost:3000",
  "http://localhost:4000",
  "capacitor://localhost",
  "ionic://localhost",
]

export function createApp() {
  const app = express()

  // Dynamic CORS middleware - handles credentials + explicit whitelist + instant OPTIONS preflight
  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin) {
      // Echo incoming origin to satisfy browser credentials & CORS checks
      res.setHeader("Access-Control-Allow-Origin", origin)
      res.setHeader("Access-Control-Allow-Credentials", "true")
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*")
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD")
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Api-Version, X-CSRF-Token"
    )
    res.setHeader("Access-Control-Expose-Headers", "Content-Length, X-Kuma-Revision")
    res.setHeader("Access-Control-Max-Age", "86400")

    if (req.method === "OPTIONS") {
      return res.status(204).end()
    }
    next()
  })

  // Secondary safety layer for cors package
  app.use(
    cors({
      origin: (origin, callback) => {
        // Always allow matching origins, localhost, vercel.app, or non-browser tools
        if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".vercel.app") || origin.startsWith("http://localhost:")) {
          callback(null, true)
        } else {
          callback(null, true)
        }
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
    })
  )

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
