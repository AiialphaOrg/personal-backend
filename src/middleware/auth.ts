import { Request, Response, NextFunction } from "express"
import { prisma } from "../lib/prisma.js"

export interface AuthenticatedRequest extends Request {
  userId?: string
  userEmail?: string
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || ""
  const token = authHeader.replace("Bearer ", "").trim()

  if (!token) {
    return res.status(401).json({ ok: false, error: "Authentication required. Please log in." })
  }

  // Format: pos_token_{userId}_{timestamp}
  const prefix = "pos_token_"
  if (!token.startsWith(prefix)) {
    return res.status(401).json({ ok: false, error: "Invalid session token. Please log in again." })
  }

  const remainder = token.slice(prefix.length)
  const lastUnderscore = remainder.lastIndexOf("_")
  const userId = lastUnderscore > 0 ? remainder.slice(0, lastUnderscore) : remainder

  if (!userId) {
    return res.status(401).json({ ok: false, error: "Invalid session token. Please log in again." })
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return res.status(401).json({ ok: false, error: "User account not found. Please log in again." })
    }
    req.userId = user.id
    req.userEmail = user.email
    return next()
  } catch (err: any) {
    // If DB is temporarily unreachable
    req.userId = userId
    return next()
  }
}
