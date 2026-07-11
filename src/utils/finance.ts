import type { Investment, PortfolioMetrics } from '../types'

const DAY = 1000 * 60 * 60 * 24

export function todayISO(date = new Date()) {
  const timezoneOffset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

export function daysHeld(dateString: string, today = new Date()) {
  const start = new Date(`${dateString}T00:00:00`)
  if (Number.isNaN(start.getTime())) return 1
  return Math.max(1, Math.floor((today.getTime() - start.getTime()) / DAY))
}

export function unlockDate(dateString: string, lockupDays?: number) {
  if (!lockupDays || lockupDays <= 0) return null
  const date = new Date(`${dateString}T12:00:00`)
  if (Number.isNaN(date.getTime())) return null
  date.setDate(date.getDate() + Math.floor(lockupDays))
  return todayISO(date)
}

export function lockupStatus(dateString: string, lockupDays?: number, today = new Date()) {
  const unlock = unlockDate(dateString, lockupDays)
  if (!unlock) return { state: 'none' as const, daysRemaining: null, unlockDate: null }
  const todayStart = new Date(`${todayISO(today)}T00:00:00`)
  const unlockStart = new Date(`${unlock}T00:00:00`)
  const daysRemaining = Math.ceil((unlockStart.getTime() - todayStart.getTime()) / DAY)
  return { state: daysRemaining > 0 ? 'active' as const : 'unlocked' as const, daysRemaining: Math.max(0, daysRemaining), unlockDate: unlock }
}

export function returnRate(investment: Investment) {
  return investment.amount > 0 ? investment.profit / investment.amount : 0
}

export function annualizedRate(investment: Investment, today = new Date()) {
  const growth = 1 + returnRate(investment)
  if (growth <= 0) return -1
  return Math.pow(growth, 365 / daysHeld(investment.date, today)) - 1
}

interface CashFlow { amount: number; date: Date }

function xnpv(rate: number, cashflows: CashFlow[]) {
  const initialDate = cashflows[0].date.getTime()
  return cashflows.reduce((sum, flow) => {
    const years = (flow.date.getTime() - initialDate) / DAY / 365
    return sum + flow.amount / Math.pow(1 + rate, years)
  }, 0)
}

/** Calculates annualized return for irregular cash flows. Returns null if no root converges. */
export function xirr(cashflows: CashFlow[]) {
  if (cashflows.length < 2 || !cashflows.some((flow) => flow.amount < 0) || !cashflows.some((flow) => flow.amount > 0)) return null
  const sorted = [...cashflows].sort((a, b) => a.date.getTime() - b.date.getTime())
  let low = -0.9999
  let high = 1
  let lowValue = xnpv(low, sorted)
  let highValue = xnpv(high, sorted)

  for (let i = 0; i < 30 && lowValue * highValue > 0; i += 1) {
    high *= 2
    highValue = xnpv(high, sorted)
  }
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || lowValue * highValue > 0) return null

  for (let i = 0; i < 120; i += 1) {
    const mid = (low + high) / 2
    const value = xnpv(mid, sorted)
    if (!Number.isFinite(value)) return null
    if (Math.abs(value) < 0.000001) return mid
    if (lowValue * value <= 0) {
      high = mid
      highValue = value
    } else {
      low = mid
      lowValue = value
    }
  }
  return (low + high) / 2
}

export function portfolioMetrics(investments: Investment[], today = new Date()): PortfolioMetrics {
  const totalAmount = investments.reduce((sum, investment) => sum + investment.amount, 0)
  const totalProfit = investments.reduce((sum, investment) => sum + investment.profit, 0)
  const returnRateValue = totalAmount ? totalProfit / totalAmount : 0
  const averageDays = totalAmount
    ? investments.reduce((sum, investment) => sum + daysHeld(investment.date, today) * investment.amount, 0) / totalAmount
    : 0
  const terminalValue = totalAmount + totalProfit
  const flows: CashFlow[] = [
    ...investments.map((investment) => ({ amount: -investment.amount, date: new Date(`${investment.date}T00:00:00`) })),
    { amount: terminalValue, date: today },
  ]
  const xirrValue = xirr(flows)
  const weighted = totalAmount
    ? investments.reduce((sum, investment) => sum + annualizedRate(investment, today) * investment.amount, 0) / totalAmount
    : 0

  return {
    totalAmount,
    totalProfit,
    returnRate: returnRateValue,
    annualizedRate: xirrValue ?? weighted,
    annualizedMethod: xirrValue === null ? 'weighted' : 'xirr',
    averageDays,
  }
}

export function formatCurrency(value: number, includeSign = false) {
  const sign = includeSign && value > 0 ? '+' : ''
  return `${sign}${new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2 }).format(value)}`
}

export function formatPercent(value: number, includeSign = true) {
  const sign = includeSign && value > 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(2)}%`
}
