// Currency conversion rates (base: USD)
const CONVERSION_RATES: Record<string, number> = {
  USD: 1.0,
  INR: 83.5, // 1 USD = 83.5 INR
  EUR: 0.92, // 1 USD = 0.92 EUR
  GBP: 0.79, // 1 USD = 0.79 GBP
  JPY: 149.5, // 1 USD = 149.5 JPY
  AUD: 1.53, // 1 USD = 1.53 AUD
  CAD: 1.36, // 1 USD = 1.36 CAD
  SGD: 1.34, // 1 USD = 1.34 SGD
}

// Currency symbols
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  INR: "₹",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
}

// Currency decimal places
const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  INR: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  AUD: 2,
  CAD: 2,
  SGD: 2,
}

/**
 * Convert amount from one currency to another
 */
export function convertCurrency(
  amount: number,
  from: string,
  to: string
): number {
  const fromUpper = from.toUpperCase()
  const toUpper = to.toUpperCase()

  // If same currency, return as is
  if (fromUpper === toUpper) {
    return amount
  }

  // Convert to USD first (base currency)
  const amountInUSD = amount / (CONVERSION_RATES[fromUpper] || 1.0)

  // Convert from USD to target currency
  const result = amountInUSD * (CONVERSION_RATES[toUpper] || 1.0)

  // Round to appropriate decimal places
  const decimals = CURRENCY_DECIMALS[toUpper] || 2
  return Math.round(result * Math.pow(10, decimals)) / Math.pow(10, decimals)
}

/**
 * Format currency for display
 */
export function formatCurrency(
  amount: number,
  currency: string,
  locale: string = "en-US"
): string {
  const currencyUpper = currency.toUpperCase()
  const symbol = CURRENCY_SYMBOLS[currencyUpper] || currencyUpper
  const decimals = CURRENCY_DECIMALS[currencyUpper] || 2

  const formattedAmount = amount.toFixed(decimals)

  // For Indian Rupee, use locale-specific formatting
  if (currencyUpper === "INR") {
    return `${symbol}${formattedAmount}`
  }

  return `${symbol}${formattedAmount}`
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currency: string): string {
  const currencyUpper = currency.toUpperCase()
  return CURRENCY_SYMBOLS[currencyUpper] || currencyUpper
}

/**
 * Get all supported currencies
 */
export function getSupportedCurrencies(): string[] {
  return Object.keys(CONVERSION_RATES)
}

/**
 * Validate currency code
 */
export function isValidCurrency(currency: string): boolean {
  const currencyUpper = currency.toUpperCase()
  return currencyUpper in CONVERSION_RATES
}

/**
 * Get conversion rate between two currencies
 */
export function getConversionRate(from: string, to: string): number {
  const fromUpper = from.toUpperCase()
  const toUpper = to.toUpperCase()

  if (fromUpper === toUpper) {
    return 1.0
  }

  const rateFrom = CONVERSION_RATES[fromUpper] || 1.0
  const rateTo = CONVERSION_RATES[toUpper] || 1.0

  return rateTo / rateFrom
}

/**
 * Calculate price in user's preferred currency
 */
export function calculatePriceInUserCurrency(
  basePrice: number,
  baseCurrency: string,
  userCurrency: string
): {
  amount: number
  currency: string
  formatted: string
} {
  const convertedAmount = convertCurrency(basePrice, baseCurrency, userCurrency)
  const formatted = formatCurrency(convertedAmount, userCurrency)

  return {
    amount: convertedAmount,
    currency: userCurrency.toUpperCase(),
    formatted,
  }
}