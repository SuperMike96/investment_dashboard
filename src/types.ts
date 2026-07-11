export interface Investment {
  id: string
  name: string
  amount: number
  date: string
  profit: number
  lockupDays?: number
  category?: string
  note?: string
}

export type SortKey = 'date' | 'value' | 'return' | 'annualized'
export type FilterKey = 'all' | 'profit' | 'loss' | 'locked'

export interface PortfolioMetrics {
  totalAmount: number
  totalProfit: number
  returnRate: number
  annualizedRate: number
  annualizedMethod: 'xirr' | 'weighted'
  averageDays: number
}
