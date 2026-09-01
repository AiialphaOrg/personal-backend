import { prisma } from "../lib/prisma.js"
import { logger } from "../lib/logger.js"
import { fetchYahooQuote } from "./yahoo-quote.js"
import type { QuoteResponse } from "../schemas/quotes.js"

function cacheTtlMs() {
  const hours = Number(process.env.QUOTE_CACHE_TTL_HOURS || 24)
  return Math.max(1, hours) * 60 * 60 * 1000
}

function toResponse(
  row: {
    symbol: string
    price: { toNumber(): number } | number
    currency: string
    source: string
    fetchedAt: Date
  },
  cached: boolean
): QuoteResponse {
  const price = typeof row.price === "number" ? row.price : row.price.toNumber()
  return {
    symbol: row.symbol,
    price,
    currency: row.currency,
    source: row.source,
    fetchedAt: row.fetchedAt.toISOString(),
    cached,
  }
}

/** Return cached quote if fresh; otherwise fetch, upsert, return. */
export async function getQuote(symbol: string): Promise<QuoteResponse> {
  const existing = await prisma.stockQuoteCache.findUnique({ where: { symbol } })
  const now = Date.now()
  if (existing && now - existing.fetchedAt.getTime() < cacheTtlMs()) {
    return toResponse(existing, true)
  }

  try {
    const live = await fetchYahooQuote(symbol)
    const row = await prisma.stockQuoteCache.upsert({
      where: { symbol },
      create: {
        symbol,
        price: live.price,
        currency: live.currency,
        source: "yahoo",
        fetchedAt: new Date(),
      },
      update: {
        price: live.price,
        currency: live.currency,
        source: "yahoo",
        fetchedAt: new Date(),
      },
    })
    return toResponse(row, false)
  } catch (err) {
    logger.warn({ err, symbol }, "live quote failed; falling back to stale cache")
    if (existing) return toResponse(existing, true)
    throw err
  }
}

export async function getQuotes(symbols: string[]): Promise<QuoteResponse[]> {
  const unique = [...new Set(symbols)]
  const results: QuoteResponse[] = []
  for (const symbol of unique) {
    results.push(await getQuote(symbol))
  }
  return results
}
