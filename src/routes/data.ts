import { Router } from "express"
import { prisma } from "../lib/prisma.js"
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js"

export const dataRouter = Router()

async function ensureDefaultWallets(userId: string) {
  try {
    const count = await prisma.wallet.count({ where: { userId } })
    if (count === 0) {
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
    console.error("ensureDefaultWallets error:", err)
  }
}


/** GET /api/data/all — Ultra-fast Lean Dashboard Snapshot + Server Computed Metrics */
dataRouter.get("/all", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    await ensureDefaultWallets(userId)

    const now = new Date()
    const todayStr = now.toISOString().split("T")[0]
    const currentMonthStr = todayStr.slice(0, 7) // e.g. "2026-09"

    // Execute optimized parallel database queries
    const [
      wallets,
      recentTransactions,
      debts,
      goals,
      tasks,
      subscriptions,
      plannedPurchases,
      spentTodayAgg,
      inflowTodayAgg,
      spentMonthAgg,
      inflowMonthAgg,
    ] = await Promise.all([
      prisma.wallet.findMany({ where: { userId } }),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50, // Cap initial dashboard history to recent 50
      }),
      prisma.debt.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.goal.findMany({ where: { userId } }),
      prisma.task.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.subscription.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.plannedPurchase.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      // Today spent (expense & bill)
      prisma.transaction.aggregate({
        where: {
          userId,
          date: todayStr,
          type: { in: ["expense", "bill", "EXPENSE", "BILL"] },
        },
        _sum: { amount: true },
      }),
      // Today inflow (income)
      prisma.transaction.aggregate({
        where: {
          userId,
          date: todayStr,
          type: { in: ["income", "INCOME"] },
        },
        _sum: { amount: true },
      }),
      // Month spent
      prisma.transaction.aggregate({
        where: {
          userId,
          date: { startsWith: currentMonthStr },
          type: { in: ["expense", "bill", "EXPENSE", "BILL"] },
        },
        _sum: { amount: true },
      }),
      // Month inflow
      prisma.transaction.aggregate({
        where: {
          userId,
          date: { startsWith: currentMonthStr },
          type: { in: ["income", "INCOME"] },
        },
        _sum: { amount: true },
      }),
    ])

    const spentToday = Number(spentTodayAgg._sum.amount || 0)
    const inflowToday = Number(inflowTodayAgg._sum.amount || 0)
    const spentThisMonth = Number(spentMonthAgg._sum.amount || 0)
    const inflowThisMonth = Number(inflowMonthAgg._sum.amount || 0)

    return res.json({
      ok: true,
      metrics: {
        spentToday,
        inflowToday,
        spentThisMonth,
        inflowThisMonth,
        todayDate: todayStr,
        currentMonth: currentMonthStr,
      },
      wallets: wallets.map((w) => ({
        id: w.id,
        name: w.title,
        title: w.title,
        kind: w.kind.toLowerCase(),
        balance: Number(w.balance),
        currency: w.currency,
        icon: w.icon,
        symbol: w.symbol,
        shares: w.shares ? Number(w.shares) : undefined,
      })),
      transactions: recentTransactions.map((t) => ({
        id: t.id,
        title: t.title,
        amount: Number(t.amount),
        type: t.type.toLowerCase(),
        category: t.category,
        date: t.date || t.createdAt.toISOString().split("T")[0],
        time: t.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        walletId: t.walletId,
        wallet: t.walletId,
        person: t.person,
        note: t.note,
      })),
      debts: debts.map((d) => ({
        id: d.id,
        person: d.person,
        amount: Number(d.amount),
        remaining: Number(d.remaining ?? d.amount),
        direction: d.type === "i_owe" || d.type === "I_OWE" ? "i_owe" : "owed_to_me",
        kind: d.category.toLowerCase(),
        status: d.status.toLowerCase(),
        dueDate: d.dueDate,
        walletId: d.walletId,
        note: d.note,
        createdAt: d.createdAt.toISOString(),
      })),
      goals: goals.map((g) => ({
        id: g.id,
        title: g.title,
        target: Number(g.targetAmount),
        current: Number(g.currentAmount),
        category: g.category,
        deadline: g.targetDate,
        createdAt: g.createdAt.toISOString(),
      })),
      tasks: tasks.map((tk) => ({
        id: tk.id,
        title: tk.title,
        completed: Boolean(tk.completed),
        dueDate: tk.dueDate,
        createdAt: tk.createdAt.toISOString(),
      })),
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        title: s.title,
        amount: Number(s.amount),
        frequency: s.frequency,
        billingDay: s.billingDay,
        walletId: s.walletId,
        category: s.category,
        enabled: Boolean(s.enabled),
        lastChargedAt: s.lastChargedAt,
        createdAt: s.createdAt.toISOString(),
      })),
      plannedPurchases: plannedPurchases.map((p) => ({
        id: p.id,
        title: p.title,
        estimatedAmount: Number(p.estimatedAmount),
        frequency: p.frequency,
        category: p.category,
        status: p.status,
        walletId: p.walletId,
        purchasedAt: p.purchasedAt,
        createdAt: p.createdAt.toISOString(),
      })),
    })

  } catch (err) {
    return next(err)
  }
})

/** GET /api/data/transactions — High-Performance Cursor Paginated Transactions with Filters */
dataRouter.get("/transactions", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30))
    const cursor = typeof req.query.cursor === "string" && req.query.cursor ? req.query.cursor : undefined
    const type = typeof req.query.type === "string" && req.query.type !== "all" ? req.query.type.toLowerCase() : undefined
    const category = typeof req.query.category === "string" && req.query.category !== "all" ? req.query.category : undefined
    const month = typeof req.query.month === "string" && req.query.month ? req.query.month : undefined
    const search = typeof req.query.search === "string" && req.query.search.trim() ? req.query.search.trim() : undefined

    const whereClause: any = { userId }

    if (type) {
      if (type === "debts") {
        whereClause.type = { in: ["i_owe", "owed_to_me"] }
      } else {
        whereClause.type = type
      }
    }

    if (category) {
      whereClause.category = category
    }

    if (month) {
      whereClause.date = { startsWith: month }
    }

    if (search) {
      whereClause.OR = [
        { title: { contains: search } },
        { person: { contains: search } },
        { category: { contains: search } },
        { note: { contains: search } },
      ]
    }

    // Fetch limit + 1 to determine if there are more records
    const rawItems = await prisma.transaction.findMany({
      where: whereClause,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { createdAt: "desc" },
    })

    const hasMore = rawItems.length > limit
    const items = hasMore ? rawItems.slice(0, limit) : rawItems
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null

    return res.json({
      ok: true,
      transactions: items.map((t) => ({
        id: t.id,
        title: t.title,
        amount: Number(t.amount),
        type: t.type.toLowerCase(),
        category: t.category,
        date: t.date,
        time: t.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        walletId: t.walletId,
        wallet: t.walletId,
        person: t.person,
        note: t.note,
      })),
      nextCursor,
      hasMore,
    })
  } catch (err) {
    return next(err)
  }
})

/** Helper to generate server-side AI Financial Overview (supports Gemini, Groq, and deterministic fallback) */
async function generateFinancialAiOverview(data: {
  month: string
  income: number
  expenses: number
  netSavings: number
  categories: Array<{ category: string; total: number; count: number }>
}) {
  const { month, income, expenses, netSavings, categories } = data
  const topCategory = categories[0]
  const savingsRate = income > 0 ? Math.round((netSavings / income) * 100) : 0

  let healthScore = 70
  let sentiment: "positive" | "caution" | "warning" = "positive"

  if (income === 0 && expenses > 0) {
    healthScore = 35
    sentiment = "warning"
  } else if (savingsRate < 0) {
    healthScore = 40
    sentiment = "warning"
  } else if (savingsRate < 20) {
    healthScore = 65
    sentiment = "caution"
  } else if (savingsRate >= 40) {
    healthScore = 90
    sentiment = "positive"
  } else {
    healthScore = 78
    sentiment = "positive"
  }

  // Attempt external free AI (Gemini / Groq) if API key provided
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  const groqKey = process.env.GROQ_API_KEY

  if (geminiKey) {
    try {
      const prompt = `You are a financial advisor. Analyze this monthly financial data for ${month}:
- Total Inflow: ₦${income}
- Total Outflow: ₦${expenses}
- Net Savings: ₦${netSavings} (Savings rate: ${savingsRate}%)
- Top expense categories: ${categories.slice(0, 4).map((c) => `${c.category}: ₦${c.total}`).join(", ")}

Respond with a JSON object strictly matching this format:
{
  "headline": "Short 4-6 word summary",
  "healthScore": number from 0 to 100,
  "sentiment": "positive" | "caution" | "warning",
  "summary": "2 concise sentences evaluating this month's cash flow",
  "keyTakeaways": ["Point 1", "Point 2", "Point 3"],
  "recommendation": "1 specific actionable advice for next month"
}`

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
      )

      if (response.ok) {
        const json = await response.json()
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) {
          const parsed = JSON.parse(text)
          return parsed
        }
      }
    } catch (e) {
      console.warn("Gemini API fallback to deterministic engine:", e)
    }
  }

  if (groqKey) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content: "You are a financial analyst. Return only a valid JSON response.",
            },
            {
              role: "user",
              content: `Analyze month ${month}: Inflow ₦${income}, Outflow ₦${expenses}, Net ₦${netSavings}. Top categories: ${categories.map((c) => `${c.category}: ₦${c.total}`).join(", ")}.
Format: {"headline": "...", "healthScore": 75, "sentiment": "positive", "summary": "...", "keyTakeaways": ["..."], "recommendation": "..."}`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      })
      if (response.ok) {
        const json = await response.json()
        const content = json.choices?.[0]?.message?.content
        if (content) {
          return JSON.parse(content)
        }
      }
    } catch (e) {
      console.warn("Groq API fallback:", e)
    }
  }

  // Fast Deterministic Financial Intelligence Engine
  let headline = "Balanced Monthly Cash Flow"
  let summary = `You recorded ₦${income.toLocaleString()} in total inflows and ₦${expenses.toLocaleString()} in outflows for ${month}.`
  const takeaways: string[] = []

  if (netSavings > 0) {
    headline = "Positive Cash Flow & Savings Growth"
    summary += ` You retained ${savingsRate}% of your income as net savings.`
    takeaways.push(`Retained +₦${netSavings.toLocaleString()} in net positive cash reserves.`)
  } else if (netSavings < 0) {
    headline = "Outflows Exceeded Monthly Inflow"
    summary += ` Outflows exceeded incoming revenue by ₦${Math.abs(netSavings).toLocaleString()}.`
    takeaways.push(`Negative variance of -₦${Math.abs(netSavings).toLocaleString()} this cycle.`)
  } else {
    headline = "Break-Even Spending Cycle"
    summary += " Your total expenses matched incoming funds exactly."
    takeaways.push("Net neutral cash flow recorded.")
  }

  if (topCategory) {
    const topPct = expenses > 0 ? Math.round((topCategory.total / expenses) * 100) : 0
    takeaways.push(
      `${topCategory.category.toUpperCase()} was your highest expense driver at ₦${topCategory.total.toLocaleString()} (${topPct}% of total outflow).`
    )
  }

  takeaways.push(`Total activity across ${categories.length} distinct budget categories.`)

  const recommendation =
    netSavings < 0
      ? `Audit your ${topCategory ? topCategory.category : "top expense"} expenditures to reduce overhead and bring net savings positive next month.`
      : savingsRate > 30
      ? `Great financial discipline! Consider allocating a portion of your ₦${netSavings.toLocaleString()} surplus into your savings or emergency goals.`
      : `Aim to increase your savings rate towards 20-30% by monitoring variable category spending.`

  return {
    headline,
    healthScore,
    sentiment,
    summary,
    keyTakeaways: takeaways,
    recommendation,
  }
}

/** GET /api/data/insights — SQL Pre-Aggregated Category Breakdowns & Cash Flow + AI Overview */
dataRouter.get("/insights", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const month = typeof req.query.month === "string" ? req.query.month : new Date().toISOString().slice(0, 7)

    // Category breakdown
    const categoryGroup = await prisma.transaction.groupBy({
      by: ["category"],
      where: {
        userId,
        date: { startsWith: month },
        type: { in: ["expense", "bill"] },
      },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: {
        _sum: {
          amount: "desc",
        },
      },
    })

    // Totals
    const [incomeTotal, expenseTotal] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          userId,
          date: { startsWith: month },
          type: "income",
        },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          userId,
          date: { startsWith: month },
          type: { in: ["expense", "bill"] },
        },
        _sum: { amount: true },
      }),
    ])

    const income = Number(incomeTotal._sum.amount || 0)
    const expenses = Number(expenseTotal._sum.amount || 0)
    const netSavings = income - expenses
    const categories = categoryGroup.map((c) => ({
      category: c.category,
      total: Number(c._sum.amount || 0),
      count: c._count.id,
    }))

    const aiOverview = await generateFinancialAiOverview({
      month,
      income,
      expenses,
      netSavings,
      categories,
    })

    return res.json({
      ok: true,
      month,
      income,
      expenses,
      netSavings,
      categories,
      aiOverview,
    })
  } catch (err) {
    return next(err)
  }
})


/** WALLETS CRUD */
dataRouter.get("/wallets", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const wallets = await prisma.wallet.findMany({ where: { userId } })
    return res.json({
      ok: true,
      wallets: wallets.map((w) => ({
        id: w.id,
        name: w.title,
        kind: w.kind.toLowerCase(),
        balance: Number(w.balance),
        currency: w.currency,
        icon: w.icon,
        symbol: w.symbol,
        shares: w.shares ? Number(w.shares) : undefined,
      })),
    })
  } catch (err) {
    return next(err)
  }
})

dataRouter.post("/wallets", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const { id, title, name, kind, balance, currency, icon, symbol, shares } = req.body || {}
    const walletId = id || `w-${Date.now()}`
    const walletName = name || title || "New Wallet"

    const walletKindMap: Record<string, any> = {
      spending: "SPENDING",
      savings: "SAVINGS",
      investment: "INVESTMENT",
    }

    const saved = await prisma.wallet.upsert({
      where: { id: walletId },
      update: {
        title: walletName,
        kind: walletKindMap[(kind || "spending").toLowerCase()] || "SPENDING",
        balance: Number(balance) || 0,
        currency: currency || "₦",
        icon: icon || "bank",
        symbol,
        shares: shares ? Number(shares) : undefined,
      },
      create: {
        id: walletId,
        userId,
        title: walletName,
        kind: walletKindMap[(kind || "spending").toLowerCase()] || "SPENDING",
        balance: Number(balance) || 0,
        currency: currency || "₦",
        icon: icon || "bank",
        symbol,
        shares: shares ? Number(shares) : undefined,
      },
    })

    return res.json({
      ok: true,
      wallet: {
        id: saved.id,
        name: saved.title,
        title: saved.title,
        kind: saved.kind.toLowerCase(),
        balance: Number(saved.balance),
        currency: saved.currency,
        icon: saved.icon,
        symbol: saved.symbol,
        shares: saved.shares ? Number(saved.shares) : undefined,
      },
    })
  } catch (err) {
    return next(err)
  }
})

dataRouter.delete("/wallets/:id", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const id = String(req.params.id)
    await prisma.wallet.deleteMany({ where: { id, userId } })
    return res.json({ ok: true, id })
  } catch (err) {
    return next(err)
  }
})

/** TRANSACTIONS CREATION & DELETION */
dataRouter.post("/transactions", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const { id, title, amount, type, category, person, date, walletId, wallet, fromWallet, toWallet, note } = req.body || {}

    const transactionId = id || `t-${Date.now()}`
    const targetWalletId = walletId || wallet || fromWallet
    const parsedAmount = Number(amount) || 0

    // Ensure wallet exists if specified
    if (targetWalletId) {
      const exists = await prisma.wallet.findUnique({ where: { id: targetWalletId } })
      if (!exists) {
        await prisma.wallet.create({
          data: {
            id: targetWalletId,
            userId,
            title: "Default Account",
            kind: "SPENDING",
            balance: 0,
          },
        })
      }
    }

    // Adjust wallet balances
    if (targetWalletId) {
      if (type === "expense" || type === "bill") {
        await prisma.wallet.update({
          where: { id: targetWalletId },
          data: { balance: { decrement: parsedAmount } },
        }).catch(() => {})
      } else if (type === "income") {
        await prisma.wallet.update({
          where: { id: targetWalletId },
          data: { balance: { increment: parsedAmount } },
        }).catch(() => {})
      }
    }

    if (type === "transfer" && fromWallet && toWallet) {
      await prisma.wallet.update({
        where: { id: fromWallet },
        data: { balance: { decrement: parsedAmount } },
      }).catch(() => {})
      await prisma.wallet.update({
        where: { id: toWallet },
        data: { balance: { increment: parsedAmount } },
      }).catch(() => {})
    }

    const created = await prisma.transaction.create({
      data: {
        id: transactionId,
        userId,
        walletId: targetWalletId || undefined,
        title: title || "Transaction",
        amount: parsedAmount,
        type: (type || "expense").toLowerCase(),
        category: category || "general",
        person: person || undefined,
        date: date || new Date().toISOString().split("T")[0],
        note: note || undefined,
      },
    })

    return res.json({
      ok: true,
      transaction: {
        id: created.id,
        title: created.title,
        amount: Number(created.amount),
        type: created.type.toLowerCase(),
        category: created.category,
        date: created.date,
        walletId: created.walletId,
      },
    })
  } catch (err) {
    return next(err)
  }
})

dataRouter.delete("/transactions/:id", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const id = String(req.params.id)
    await prisma.transaction.deleteMany({ where: { id, userId } })
    return res.json({ ok: true, id })
  } catch (err) {
    return next(err)
  }
})

/** DEBTS CRUD */
dataRouter.get("/debts", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const debts = await prisma.debt.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })
    return res.json({
      ok: true,
      debts: debts.map((d) => ({
        id: d.id,
        person: d.person,
        amount: Number(d.amount),
        remaining: Number(d.remaining ?? d.amount),
        direction: d.type === "i_owe" ? "i_owe" : "owed_to_me",
        kind: d.category.toLowerCase(),
        status: d.status.toLowerCase(),
        dueDate: d.dueDate,
      })),
    })
  } catch (err) {
    return next(err)
  }
})

dataRouter.post("/debts", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const { id, person, amount, remaining, direction, kind, dueDate, walletId, isCashLoan, category, note } = req.body || {}

    const debtId = id || `d-${Date.now()}`
    const parsedAmount = Number(amount) || 0
    const parsedRemaining = remaining !== undefined ? Number(remaining) : parsedAmount
    const dir = (direction || "i_owe").toLowerCase()

    const saved = await prisma.debt.upsert({
      where: { id: debtId },
      update: {
        person: person || "Someone",
        amount: parsedAmount,
        remaining: parsedRemaining,
        type: dir,
        category: (kind || category || "loan").toLowerCase(),
        dueDate,
        walletId,
        note,
      },
      create: {
        id: debtId,
        userId,
        person: person || "Someone",
        amount: parsedAmount,
        remaining: parsedRemaining,
        type: dir,
        category: (kind || category || "loan").toLowerCase(),
        status: "open",
        dueDate,
        walletId,
        note,
      },
    })

    // If marked as immediate cash loan, adjust wallet and record transaction
    if (isCashLoan && walletId && parsedAmount > 0) {
      if (dir === "owed_to_me") {
        await prisma.wallet.update({
          where: { id: walletId },
          data: { balance: { decrement: parsedAmount } },
        }).catch(() => {})

        await prisma.transaction.create({
          data: {
            id: `t-debt-${Date.now()}`,
            userId,
            walletId,
            title: `Loan given to ${person}`,
            amount: parsedAmount,
            type: "owed_to_me",
            category: category || "loan",
            date: new Date().toISOString().split("T")[0],
          },
        }).catch(() => {})
      } else if (dir === "i_owe") {
        await prisma.wallet.update({
          where: { id: walletId },
          data: { balance: { increment: parsedAmount } },
        }).catch(() => {})

        await prisma.transaction.create({
          data: {
            id: `t-debt-${Date.now()}`,
            userId,
            walletId,
            title: `Borrowed cash from ${person}`,
            amount: parsedAmount,
            type: "i_owe",
            category: category || "loan",
            date: new Date().toISOString().split("T")[0],
          },
        }).catch(() => {})
      }
    }

    return res.json({
      ok: true,
      debt: {
        id: saved.id,
        person: saved.person,
        amount: Number(saved.amount),
        remaining: Number(saved.remaining),
        direction: saved.type === "i_owe" ? "i_owe" : "owed_to_me",
        kind: saved.category.toLowerCase(),
        status: saved.status.toLowerCase(),
        dueDate: saved.dueDate,
      },
    })
  } catch (err) {
    return next(err)
  }
})

dataRouter.post("/debts/:id/settle", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const id = String(req.params.id)
    const { amount, walletId } = req.body || {}
    const settleAmt = Number(amount) || 0

    const debt = await prisma.debt.findUnique({ where: { id } })
    if (!debt || debt.userId !== userId) {
      return res.status(404).json({ ok: false, error: "Debt record not found" })
    }

    const currentRemaining = Number(debt.remaining ?? debt.amount)
    const newRemaining = Math.max(0, currentRemaining - settleAmt)
    const newStatus = newRemaining === 0 ? "paid" : "partial"

    const updated = await prisma.debt.update({
      where: { id },
      data: {
        remaining: newRemaining,
        status: newStatus,
      },
    })

    // Adjust wallet and create settlement transaction
    if (walletId && settleAmt > 0) {
      if (debt.type === "owed_to_me") {
        await prisma.wallet.update({
          where: { id: walletId },
          data: { balance: { increment: settleAmt } },
        }).catch(() => {})

        await prisma.transaction.create({
          data: {
            id: `t-settle-${Date.now()}`,
            userId,
            walletId,
            title: `Debt Repayment received from ${debt.person}`,
            amount: settleAmt,
            type: "income",
            category: "client",
            date: new Date().toISOString().split("T")[0],
          },
        }).catch(() => {})
      } else {
        await prisma.wallet.update({
          where: { id: walletId },
          data: { balance: { decrement: settleAmt } },
        }).catch(() => {})

        await prisma.transaction.create({
          data: {
            id: `t-settle-${Date.now()}`,
            userId,
            walletId,
            title: `Settled debt to ${debt.person}`,
            amount: settleAmt,
            type: "expense",
            category: "general",
            date: new Date().toISOString().split("T")[0],
          },
        }).catch(() => {})
      }
    }

    return res.json({
      ok: true,
      debt: {
        id: updated.id,
        person: updated.person,
        amount: Number(updated.amount),
        remaining: Number(updated.remaining),
        direction: updated.type === "i_owe" ? "i_owe" : "owed_to_me",
        status: updated.status.toLowerCase(),
      },
    })
  } catch (err) {
    return next(err)
  }
})

dataRouter.delete("/debts/:id", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const id = String(req.params.id)
    await prisma.debt.deleteMany({ where: { id, userId } })
    return res.json({ ok: true, id })
  } catch (err) {
    return next(err)
  }
})

/** GOALS CRUD */
dataRouter.get("/goals", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const goals = await prisma.goal.findMany({ where: { userId } })
    return res.json({
      ok: true,
      goals: goals.map((g) => ({
        id: g.id,
        title: g.title,
        target: Number(g.targetAmount),
        current: Number(g.currentAmount),
        category: g.category,
        deadline: g.targetDate,
      })),
    })
  } catch (err) {
    return next(err)
  }
})

dataRouter.post("/goals", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const { id, title, target, current, category, deadline } = req.body || {}
    const goalId = id || `g-${Date.now()}`

    const saved = await prisma.goal.upsert({
      where: { id: goalId },
      update: {
        title: title || "Savings Goal",
        targetAmount: Number(target) || 0,
        currentAmount: Number(current) || 0,
        category,
        targetDate: deadline,
      },
      create: {
        id: goalId,
        userId,
        title: title || "Savings Goal",
        targetAmount: Number(target) || 0,
        currentAmount: Number(current) || 0,
        category,
        targetDate: deadline,
      },
    })

    return res.json({
      ok: true,
      goal: {
        id: saved.id,
        title: saved.title,
        target: Number(saved.targetAmount),
        current: Number(saved.currentAmount),
        category: saved.category,
        deadline: saved.targetDate,
      },
    })
  } catch (err) {
    return next(err)
  }
})

dataRouter.delete("/goals/:id", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const id = String(req.params.id)
    await prisma.goal.deleteMany({ where: { id, userId } })
    return res.json({ ok: true, id })
  } catch (err) {
    return next(err)
  }
})

/** TASKS CRUD */
dataRouter.get("/tasks", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const tasks = await prisma.task.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })
    return res.json({
      ok: true,
      tasks: tasks.map((tk) => ({
        id: tk.id,
        title: tk.title,
        completed: Boolean(tk.completed),
        dueDate: tk.dueDate,
      })),
    })
  } catch (err) {
    return next(err)
  }
})

dataRouter.post("/tasks", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const { id, title, completed, dueDate } = req.body || {}
    const taskId = id || `task-${Date.now()}`

    const saved = await prisma.task.upsert({
      where: { id: taskId },
      update: {
        title: title || "Task",
        completed: Boolean(completed),
        dueDate,
      },
      create: {
        id: taskId,
        userId,
        title: title || "Task",
        completed: Boolean(completed),
        dueDate,
      },
    })

    return res.json({
      ok: true,
      task: {
        id: saved.id,
        title: saved.title,
        completed: Boolean(saved.completed),
        dueDate: saved.dueDate,
      },
    })
  } catch (err) {
    return next(err)
  }
})

dataRouter.patch("/tasks/:id/toggle", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const id = String(req.params.id)
    const existing = await prisma.task.findUnique({ where: { id } })
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ ok: false, error: "Task not found" })
    }

    const updated = await prisma.task.update({
      where: { id },
      data: { completed: !existing.completed },
    })

    return res.json({
      ok: true,
      task: {
        id: updated.id,
        title: updated.title,
        completed: Boolean(updated.completed),
      },
    })
  } catch (err) {
    return next(err)
  }
})

dataRouter.delete("/tasks/:id", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const id = String(req.params.id)
    await prisma.task.deleteMany({ where: { id, userId } })
    return res.json({ ok: true, id })
  } catch (err) {
    return next(err)
  }
})

/** SUBSCRIPTIONS CRUD & CHARGE ACTION */
dataRouter.get("/subscriptions", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const subs = await prisma.subscription.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })
    return res.json({
      ok: true,
      subscriptions: subs.map((s) => ({
        id: s.id,
        title: s.title,
        amount: Number(s.amount),
        frequency: s.frequency,
        billingDay: s.billingDay,
        walletId: s.walletId,
        category: s.category,
        enabled: Boolean(s.enabled),
        lastChargedAt: s.lastChargedAt,
      })),
    })
  } catch (err) {
    return next(err)
  }
})

dataRouter.post("/subscriptions", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const { id, title, amount, frequency, billingDay, walletId, category, enabled } = req.body || {}
    const subId = id || `sub-${Date.now()}`

    const saved = await prisma.subscription.upsert({
      where: { id: subId },
      update: {
        title: title || "Subscription",
        amount: Number(amount) || 0,
        frequency: frequency || "monthly",
        billingDay: billingDay ? Number(billingDay) : undefined,
        walletId: walletId || undefined,
        category: category || "general",
        enabled: enabled !== undefined ? Boolean(enabled) : true,
      },
      create: {
        id: subId,
        userId,
        title: title || "Subscription",
        amount: Number(amount) || 0,
        frequency: frequency || "monthly",
        billingDay: billingDay ? Number(billingDay) : undefined,
        walletId: walletId || undefined,
        category: category || "general",
        enabled: enabled !== undefined ? Boolean(enabled) : true,
      },
    })

    return res.json({
      ok: true,
      subscription: {
        id: saved.id,
        title: saved.title,
        amount: Number(saved.amount),
        frequency: saved.frequency,
        billingDay: saved.billingDay,
        walletId: saved.walletId,
        category: saved.category,
        enabled: Boolean(saved.enabled),
        lastChargedAt: saved.lastChargedAt,
      },
    })
  } catch (err) {
    return next(err)
  }
})

dataRouter.delete("/subscriptions/:id", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const id = String(req.params.id)
    await prisma.subscription.deleteMany({ where: { id, userId } })
    return res.json({ ok: true, id })
  } catch (err) {
    return next(err)
  }
})

dataRouter.post("/subscriptions/:id/charge", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const id = String(req.params.id)
    const sub = await prisma.subscription.findUnique({ where: { id } })
    if (!sub || sub.userId !== userId) {
      return res.status(404).json({ ok: false, error: "Subscription not found" })
    }

    const todayStr = new Date().toISOString().split("T")[0]
    const chosenWalletId = req.body?.walletId || sub.walletId

    // Deduct wallet balance if walletId exists
    if (chosenWalletId) {
      const wallet = await prisma.wallet.findUnique({ where: { id: chosenWalletId } })
      if (wallet && wallet.userId === userId) {
        await prisma.wallet.update({
          where: { id: chosenWalletId },
          data: { balance: { decrement: sub.amount } },
        })
      }
    }

    // Log the transaction
    const txn = await prisma.transaction.create({
      data: {
        userId,
        title: `Subscription: ${sub.title}`,
        amount: sub.amount,
        type: "expense",
        category: sub.category || "utilities",
        walletId: chosenWalletId,
        date: todayStr,
        note: `Recurring ${sub.frequency} subscription charge`,
      },
    })

    // Update last charged date on subscription
    await prisma.subscription.update({
      where: { id },
      data: { lastChargedAt: todayStr },
    })

    return res.json({
      ok: true,
      transaction: {
        id: txn.id,
        title: txn.title,
        amount: Number(txn.amount),
        type: "expense",
        category: txn.category,
        date: txn.date,
        walletId: txn.walletId,
      },
    })
  } catch (err) {
    return next(err)
  }
})

/** PLANNED PURCHASES / WISHLIST CRUD & CHECKOUT */
dataRouter.get("/planned-purchases", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const items = await prisma.plannedPurchase.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })
    return res.json({
      ok: true,
      plannedPurchases: items.map((p) => ({
        id: p.id,
        title: p.title,
        estimatedAmount: Number(p.estimatedAmount),
        frequency: p.frequency,
        category: p.category,
        status: p.status,
        walletId: p.walletId,
        purchasedAt: p.purchasedAt,
      })),
    })
  } catch (err) {
    return next(err)
  }
})

dataRouter.post("/planned-purchases", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const { id, title, estimatedAmount, frequency, category, status, walletId } = req.body || {}
    const itemId = id || `plan-${Date.now()}`

    const saved = await prisma.plannedPurchase.upsert({
      where: { id: itemId },
      update: {
        title: title || "Planned Item",
        estimatedAmount: Number(estimatedAmount) || 0,
        frequency: frequency || "once",
        category: category || "general",
        status: status || "planned",
        walletId: walletId || undefined,
      },
      create: {
        id: itemId,
        userId,
        title: title || "Planned Item",
        estimatedAmount: Number(estimatedAmount) || 0,
        frequency: frequency || "once",
        category: category || "general",
        status: status || "planned",
        walletId: walletId || undefined,
      },
    })

    return res.json({
      ok: true,
      plannedPurchase: {
        id: saved.id,
        title: saved.title,
        estimatedAmount: Number(saved.estimatedAmount),
        frequency: saved.frequency,
        category: saved.category,
        status: saved.status,
        walletId: saved.walletId,
        purchasedAt: saved.purchasedAt,
      },
    })
  } catch (err) {
    return next(err)
  }
})

dataRouter.delete("/planned-purchases/:id", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const id = String(req.params.id)
    await prisma.plannedPurchase.deleteMany({ where: { id, userId } })
    return res.json({ ok: true, id })
  } catch (err) {
    return next(err)
  }
})

dataRouter.post("/planned-purchases/:id/checkout", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!
    const id = String(req.params.id)
    const item = await prisma.plannedPurchase.findUnique({ where: { id } })
    if (!item || item.userId !== userId) {
      return res.status(404).json({ ok: false, error: "Item not found" })
    }

    const { paymentMethod, actualAmount, walletId, person, dueDate } = req.body || {}
    const finalAmount = Number(actualAmount) || Number(item.estimatedAmount)
    const todayStr = new Date().toISOString().split("T")[0]

    let resultTxn: any = null
    let resultDebt: any = null

    if (paymentMethod === "credit" || paymentMethod === "payable") {
      // Create a Payable (I Owe) debt
      resultDebt = await prisma.debt.create({
        data: {
          userId,
          person: person?.trim() || "Store / Vendor",
          amount: finalAmount,
          remaining: finalAmount,
          type: "i_owe",
          category: item.category || "general",
          dueDate: dueDate || undefined,
          note: `Purchased planned item: ${item.title}`,
        },
      })
    } else {
      // Paid Now -> Create Expense and Deduct from Wallet
      if (walletId) {
        const wallet = await prisma.wallet.findUnique({ where: { id: walletId } })
        if (wallet && wallet.userId === userId) {
          await prisma.wallet.update({
            where: { id: walletId },
            data: { balance: { decrement: finalAmount } },
          })
        }
      }

      resultTxn = await prisma.transaction.create({
        data: {
          userId,
          title: item.title,
          amount: finalAmount,
          type: "expense",
          category: item.category || "general",
          walletId: walletId || undefined,
          date: todayStr,
          note: `Bought planned purchase: ${item.title}`,
        },
      })
    }

    // Mark planned item status
    const updated = await prisma.plannedPurchase.update({
      where: { id },
      data: {
        status: "purchased",
        purchasedAt: todayStr,
      },
    })

    return res.json({
      ok: true,
      plannedPurchase: {
        id: updated.id,
        title: updated.title,
        status: updated.status,
        purchasedAt: updated.purchasedAt,
      },
      transaction: resultTxn,
      debt: resultDebt,
    })
  } catch (err) {
    return next(err)
  }
})

