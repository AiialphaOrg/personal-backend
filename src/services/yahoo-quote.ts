/**
 * Fetch latest equity price from Yahoo Finance chart API (no API key).
 * Suitable for MVP personal use; swap for Finnhub/Alpha Vantage later.
 */
export async function fetchYahooQuote(symbol: string): Promise<{
  price: number
  currency: string
}> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const res = await fetch(url, {
    headers: {
      "User-Agent": "PersonalOS/0.1 (personal finance)",
      Accept: "application/json",
    },
  })
  if (!res.ok) {
    throw new Error(`Yahoo quote failed (${res.status}) for ${symbol}`)
  }
  const data = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number
          currency?: string
          previousClose?: number
        }
      }>
      error?: { description?: string }
    }
  }
  if (data.chart?.error) {
    throw new Error(data.chart.error.description || `Unknown symbol ${symbol}`)
  }
  const meta = data.chart?.result?.[0]?.meta
  const price = meta?.regularMarketPrice ?? meta?.previousClose
  if (price == null || !Number.isFinite(price)) {
    throw new Error(`No price for ${symbol}`)
  }
  return {
    price,
    currency: meta?.currency || "USD",
  }
}
