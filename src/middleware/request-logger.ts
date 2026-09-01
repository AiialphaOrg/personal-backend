import type { Request, Response, NextFunction } from "express"

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()
  const { method, originalUrl } = req

  res.on("finish", () => {
    const duration = Date.now() - start
    const status = res.statusCode

    // ANSI Colors
    const statusColor =
      status >= 500
        ? "\x1b[31m" // Red
        : status >= 400
        ? "\x1b[33m" // Yellow
        : status >= 300
        ? "\x1b[36m" // Cyan
        : "\x1b[32m" // Green

    const methodColor = "\x1b[35m" // Magenta
    const reset = "\x1b[0m"
    const gray = "\x1b[90m"

    const time = new Date().toLocaleTimeString("en-US", { hour12: false })

    console.log(
      `${gray}[${time}]${reset} ${methodColor}${method.padEnd(6)}${reset} ${statusColor}${status}${reset} ${originalUrl} ${gray}${duration}ms${reset}`
    )
  })

  next()
}
