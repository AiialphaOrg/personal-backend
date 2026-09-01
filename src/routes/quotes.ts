import { Router } from "express"
import { quotesBatchSchema, symbolParamSchema } from "../schemas/quotes.js"
import { getQuote, getQuotes } from "../services/quotes.js"

export const quotesRouter = Router()

quotesRouter.get("/:symbol", async (req, res, next) => {
  try {
    const { symbol } = symbolParamSchema.parse(req.params)
    const quote = await getQuote(symbol)
    res.json(quote)
  } catch (err) {
    next(err)
  }
})

quotesRouter.post("/batch", async (req, res, next) => {
  try {
    const { symbols } = quotesBatchSchema.parse(req.body)
    const quotes = await getQuotes(symbols)
    res.json({ quotes })
  } catch (err) {
    next(err)
  }
})
