import { ZodError } from "zod"
import type { ErrorRequestHandler, RequestHandler } from "express"
import { logger } from "../lib/logger.js"

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Not found" })
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten() })
    return
  }
  const message = err instanceof Error ? err.message : "Server error"
  logger.error({ err }, message)
  const status = message.includes("No price") || message.includes("Unknown") ? 404 : 500
  res.status(status).json({ error: message })
}
