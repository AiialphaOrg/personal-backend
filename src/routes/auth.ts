import { Router } from "express"
import { prisma } from "../lib/prisma.js"
import { z } from "zod"
import bcrypt from "bcryptjs"

export const authRouter = Router()

const RegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().optional(),
})

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
})

const GoogleAuthSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().optional(),
  avatarUrl: z.string().optional(),
})

async function ensureDefaultWallets(userId: string) {
  try {
    const existing = await prisma.wallet.findMany({ where: { userId } })
    if (existing.length === 0) {
      await prisma.wallet.create({
        data: {
          id: `w-cash-${userId.slice(-6)}`,
          userId,
          title: "Cash Wallet",
          kind: "SPENDING",
          balance: 0,
          currency: "₦",
          icon: "cash",
        },
      })
    }
  } catch (err) {
    console.error("Error creating default wallet:", err)
  }
}


/** POST /api/auth/register — Email & Password Registration directly in DB */
authRouter.post("/register", async (req, res, next) => {
  try {
    const parseResult = RegisterSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({ ok: false, error: parseResult.error.issues[0]?.message || "Invalid input" })
    }

    const { email, password, name } = parseResult.data
    const cleanEmail = email.trim().toLowerCase()

    // 1. Check existing
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } })
    if (existing) {
      return res.status(400).json({ ok: false, error: "An account with this email already exists" })
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(password, 10)
    const displayName = (name || cleanEmail.split("@")[0]).trim()

    // 3. Create user in database
    const user = await prisma.user.create({
      data: {
        email: cleanEmail,
        password: hashedPassword,
        name: displayName,
        authMethod: "password",
      },
    })

    // 4. Create default accounts in DB
    await ensureDefaultWallets(user.id)

    const token = `pos_token_${user.id}_${Date.now()}`

    return res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || "Registration failed" })
  }
})

/** POST /api/auth/login — Email & Password Login directly against DB */
authRouter.post("/login", async (req, res, next) => {
  try {
    const parseResult = LoginSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({ ok: false, error: parseResult.error.issues[0]?.message || "Invalid input" })
    }

    const { email, password } = parseResult.data
    const cleanEmail = email.trim().toLowerCase()

    // 1. Find user
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } })
    if (!user) {
      return res.status(401).json({ ok: false, error: "No account found with this email" })
    }

    // 2. Check password
    if (!user.password) {
      return res.status(401).json({ ok: false, error: "Please log in using Google for this account" })
    }

    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) {
      return res.status(401).json({ ok: false, error: "Incorrect password" })
    }

    // 3. Make sure default wallets exist
    await ensureDefaultWallets(user.id)

    const token = `pos_token_${user.id}_${Date.now()}`

    return res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || cleanEmail.split("@")[0],
        avatarUrl: user.avatarUrl,
      },
    })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || "Login failed" })
  }
})

/** POST /api/auth/google — Direct Google Login / Registration in DB */
authRouter.post("/google", async (req, res, next) => {
  try {
    const parseResult = GoogleAuthSchema.safeParse(req.body)
    const data = parseResult.success ? parseResult.data : {}
    const cleanEmail = (data.email || "user@gmail.com").trim().toLowerCase()

    const user = await prisma.user.upsert({
      where: { email: cleanEmail },
      update: {
        name: data.name || undefined,
        avatarUrl: data.avatarUrl || undefined,
        updatedAt: new Date(),
      },
      create: {
        email: cleanEmail,
        name: data.name || "Google User",
        avatarUrl: data.avatarUrl || undefined,
        authMethod: "google",
      },
    })

    await ensureDefaultWallets(user.id)

    const token = `pos_token_${user.id}_${Date.now()}`

    return res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || "Google authentication failed" })
  }
})

/** GET /api/auth/me — Validate current token against Database */
authRouter.get("/me", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "No session token provided" })
    }

    const token = authHeader.replace("Bearer ", "").trim()
    let userId = ""

    if (token.startsWith("pos_token_")) {
      const remainder = token.slice("pos_token_".length)
      const lastUnderscore = remainder.lastIndexOf("_")
      userId = lastUnderscore > 0 ? remainder.slice(0, lastUnderscore) : remainder
    } else if (token.startsWith("neon_")) {
      userId = token.replace("neon_", "")
    } else {
      userId = token
    }

    let user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user && userId.includes("@")) {
      user = await prisma.user.findUnique({ where: { email: userId.toLowerCase() } })
    }

    if (!user) {
      return res.status(401).json({ ok: false, error: "User session expired or not found" })
    }

    return res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    })
  } catch (err: any) {
    return res.status(401).json({ ok: false, error: "Failed to validate session" })
  }
})
