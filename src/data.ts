import type { Investment } from './types'

export const exampleInvestments: Investment[] = [
  { id: 'demo-1', name: '稳健理财 A', amount: 50000, date: '2025-12-18', profit: 1860, category: '固收理财', note: '中低风险 · 90 天' },
  { id: 'demo-2', name: '指数增强组合', amount: 28000, date: '2026-02-06', profit: 2315.6, category: '基金', note: '权益类 · 长期配置' },
  { id: 'demo-3', name: '现金管理计划', amount: 20000, date: '2026-04-25', profit: 198.4, category: '现金管理', note: '随取随用' },
  { id: 'demo-4', name: '黄金积存', amount: 12000, date: '2026-05-28', profit: -156, category: '黄金/商品', note: '商品类 · 波动持有' },
]
