import { z } from "zod"

export const symbolParamSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .transform((s) => s.toUpperCase()),
})

export const quotesBatchSchema = z.object({
  symbols: z
    .array(z.string().trim().min(1).max(32))
    .min(1)
    .max(40)
    .transform((arr) => arr.map((s) => s.toUpperCase())),
})

export const healthSchema = z.object({
  ok: z.literal(true),
})

export type QuoteResponse = {
  symbol: string
  price: number
  currency: string
  source: string
  fetchedAt: string
  cached: boolean
}
