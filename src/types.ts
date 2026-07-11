export interface Investment {
  id: string
  name: string
  amount: number
  date: string
  profit: number
  lockupDays?: number
  note?: string
}

export type SortKey = 'date' | 'return' | 'annualized'
export type FilterKey = 'all' | 'profit' | 'loss'

export interface PortfolioMetrics {
  totalAmount: number
  totalProfit: number
  returnRate: number
  annualizedRate: number
  annualizedMethod: 'xirr' | 'weighted'
  averageDays: number
}
