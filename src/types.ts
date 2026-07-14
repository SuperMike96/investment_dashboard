export interface Redemption {
  id: string
  date: string
  /** Cash received from the redemption. */
  amount: number
  /** Principal released by this redemption. */
  principal?: number
}

export interface ClosedInvestment {
  id: string
  sourceInvestmentId: string
  sourceName: string
  category?: string
  purchaseDate: string
  redemptionDate: string
  principal: number
  amount: number
  profit: number
}

export interface Investment {
  id: string
  name: string
  amount: number
  date: string
  profit: number
  redemptions?: Redemption[]
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
