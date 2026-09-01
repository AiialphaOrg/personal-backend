import { Router } from "express"

export const syncRouter = Router()

// In-memory / file backup store for sync mutations
const serverSnapshot: Record<string, any[]> = {
  wallets: [],
  timeline: [],
  debts: [],
  goals: [],
  tasks: [],
}

/** GET /api/sync/pull — Returns latest server snapshot */
syncRouter.get("/pull", (_req, res) => {
  res.json({
    ok: true,
    serverTime: new Date().toISOString(),
    snapshot: serverSnapshot,
  })
})

/** POST /api/sync/push — Processes outbox queue mutations from frontend */
syncRouter.post("/push", (req, res) => {
  const { mutations } = req.body || {}

  if (!Array.isArray(mutations)) {
    return res.status(400).json({ ok: false, error: "Invalid mutations array" })
  }

  let processedCount = 0

  for (const m of mutations) {
    const { entity, action, data } = m || {}
    if (!entity || !serverSnapshot[entity]) continue

    if (action === "upsert") {
      const list = serverSnapshot[entity]
      const idx = list.findIndex((item) => item.id === data.id)
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() }
      } else {
        list.push({ ...data, updatedAt: new Date().toISOString() })
      }
      processedCount++
    } else if (action === "delete") {
      serverSnapshot[entity] = serverSnapshot[entity].filter((item) => item.id !== data.id)
      processedCount++
    }
  }

  return res.json({
    ok: true,
    syncedCount: processedCount,
    serverTime: new Date().toISOString(),
  })
})
