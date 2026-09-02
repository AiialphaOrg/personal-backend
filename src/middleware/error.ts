import { ZodError } from "zod"
import type { ErrorRequestHandler, RequestHandler } from "express"
import { logger } from "../lib/logger.js"

export const notFound: RequestHandler = (req, res) => {
  if (req.headers.origin) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin)
    res.setHeader("Access-Control-Allow-Credentials", "true")
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*")
  }
  res.status(404).json({ error: "Not found" })
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (req.headers.origin) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin)
    res.setHeader("Access-Control-Allow-Credentials", "true")
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*")
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten() })
    return
  }
  const message = err instanceof Error ? err.message : "Server error"
  logger.error({ err }, message)
  const status = message.includes("No price") || message.includes("Unknown") ? 404 : 500
  res.status(status).json({ error: message })
}
