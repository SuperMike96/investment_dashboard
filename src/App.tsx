import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  Eye,
  EyeOff,
  Edit3,
  FileUp,
  Landmark,
  LayoutDashboard,
  LoaderCircle,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react'
import { exampleInvestments } from './data'
import type { FilterKey, Investment, Redemption, SortKey } from './types'
import {
  annualizedRate,
  currentValue as investmentCurrentValue,
  daysHeld,
  formatCurrency,
  formatPercent,
  portfolioMetrics,
  returnRate,
  totalRedeemed,
  lockupStatus,
  todayISO,
} from './utils/finance'

const STORAGE_KEY = 'wealth-yield-dashboard-investments'
const SAVE_META_KEY = 'wealth-yield-dashboard-last-saved'
const CATEGORIES = ['现金管理', '固收理财', '基金', '股票/ETF', '黄金/商品', '其他']

type FormValues = Omit<Investment, 'id'>
type ChartRange = '30D' | '90D' | '1Y' | 'ALL'

const createEmptyForm = (): FormValues => ({
  name: '',
  amount: 0,
  date: todayISO(),
  profit: 0,
  lockupDays: undefined,
  category: '其他',
  redemptions: [],
  note: '',
})

function loadInvestments(): Investment[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return exampleInvestments
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : exampleInvestments
  } catch {
    return exampleInvestments
  }
}

function loadSavedAt() {
  try {
    const value = localStorage.getItem(SAVE_META_KEY)
    const date = value ? new Date(value) : new Date()
    return Number.isNaN(date.getTime()) ? new Date() : date
  } catch {
    return new Date()
  }
}

function normalizeRedemptions(value: unknown): Redemption[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Redemption => Boolean(item && typeof item.date === 'string' && Number(item.amount) > 0))
    .map((item) => ({ id: typeof item.id === 'string' ? item.id : crypto.randomUUID(), date: item.date, amount: Number(item.amount) }))
}

function downloadFile(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function parseCsvRecords(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1 }
    else if (character === '"') quoted = !quoted
    else if (character === ',' && !quoted) { row.push(cell.trim()); cell = '' }
    else if (character === '\n' && !quoted) { row.push(cell.trim()); rows.push(row); row = []; cell = '' }
    else if (character !== '\r' || quoted) cell += character
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row) }
  return rows.filter((currentRow) => currentRow.some((value) => value.length > 0))
}

function parseCsvImport(text: string): Investment[] {
  const rows = parseCsvRecords(text.replace(/^\uFEFF/, ''))
  if (rows.length < 2) return []
  const headers = rows[0]
  const indexOf = (header: string) => headers.indexOf(header)
  return rows.slice(1).map((cells) => {
    const amount = Number(cells[indexOf('购入金额')] ?? 0)
    const profit = Number(cells[indexOf('当前暂时盈利')] ?? 0)
    const lockupValue = Number(cells[indexOf('封闭期（天）')] ?? 0)
    let redemptions: Redemption[] = []
    try { redemptions = normalizeRedemptions(JSON.parse(cells[indexOf('赎回记录(JSON)')] ?? '[]')) } catch { redemptions = [] }
    return { id: crypto.randomUUID(), name: cells[indexOf('名称')] ?? '', amount, date: cells[indexOf('购入日期')] ?? '', profit, lockupDays: lockupValue > 0 ? lockupValue : undefined, category: cells[indexOf('类型')] ?? '其他', redemptions, note: cells[indexOf('备注')] ?? '' }
  }).filter((item) => item.name && item.amount > 0 && item.date && Number.isFinite(item.profit))
}

function categoryClass(category?: string) {
  if (category === '现金管理') return 'category-label--cash'
  if (category === '固收理财') return 'category-label--fixed'
  if (category === '基金') return 'category-label--fund'
  if (category === '股票/ETF') return 'category-label--equity'
  if (category === '黄金/商品') return 'category-label--commodity'
  return 'category-label--other'
}

function makeTrendData(investments: Investment[], range: ChartRange) {
  const now = new Date()
  const earliest = investments.length
    ? Math.min(...investments.map((investment) => new Date(`${investment.date}T00:00:00`).getTime()))
    : now.getTime() - 30 * 86_400_000
  const rangeDays: Record<Exclude<ChartRange, 'ALL'>, number> = { '30D': 30, '90D': 90, '1Y': 365 }
  const rangeStart = range === 'ALL' ? earliest : Math.max(earliest, now.getTime() - rangeDays[range] * 86_400_000)
  const span = Math.max(now.getTime() - rangeStart, 10 * 86_400_000)

  return Array.from({ length: 12 }, (_, index) => {
    const point = new Date(rangeStart + (span * index) / 11)
    const totals = investments.reduce(
      (acc, investment) => {
        const purchaseTime = new Date(`${investment.date}T00:00:00`).getTime()
        if (point.getTime() < purchaseTime) return acc
        const progression = Math.min(1, Math.max(0, (point.getTime() - purchaseTime) / Math.max(1, now.getTime() - purchaseTime)))
        const redeemedBefore = (investment.redemptions ?? []).reduce((sum, redemption) => sum + (new Date(`${redemption.date}T00:00:00`).getTime() <= point.getTime() ? redemption.amount : 0), 0)
        acc.invested += investment.amount - redeemedBefore
        acc.profit += investment.profit * progression
        return acc
      },
      { invested: 0, profit: 0 },
    )
    return {
      label: `${point.getMonth() + 1}/${point.getDate()}`,
      profit: Number(totals.profit.toFixed(2)),
      value: Number((totals.invested + totals.profit).toFixed(2)),
      rate: totals.invested ? Number(((totals.profit / totals.invested) * 100).toFixed(2)) : 0,
    }
  })
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = 'violet',
}: {
  label: string
  value: string
  hint: ReactNode
  icon: ReactNode
  tone?: 'violet' | 'cyan' | 'green' | 'pink'
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-card__top">
        <span>{label}</span>
        <span className="metric-card__icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{hint}</p>
    </article>
  )
}

function App() {
  const [investments, setInvestments] = useState<Investment[]>(loadInvestments)
  const [form, setForm] = useState<FormValues>(createEmptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [chartRange, setChartRange] = useState<ChartRange>('ALL')
  const [privacyMode, setPrivacyMode] = useState(false)
  const [toast, setToast] = useState('')
  const [savedAt, setSavedAt] = useState(loadSavedAt)
  const [redemptionDate, setRedemptionDate] = useState(todayISO())
  const [redemptionAmount, setRedemptionAmount] = useState(0)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(investments))
    const now = new Date()
    localStorage.setItem(SAVE_META_KEY, now.toISOString())
    setSavedAt(now)
  }, [investments])

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const metrics = useMemo(() => portfolioMetrics(investments), [investments])
  const trendData = useMemo(() => makeTrendData(investments, chartRange), [chartRange, investments])
  const visibleInvestments = useMemo(() => {
    return [...investments]
      .filter((investment) => {
        if (categoryFilter !== 'all' && (investment.category || '其他') !== categoryFilter) return false
        if (filter === 'all') return true
        if (filter === 'locked') return lockupStatus(investment.date, investment.lockupDays).state === 'active'
        return filter === 'profit' ? investment.profit >= 0 : investment.profit < 0
      })
      .sort((a, b) => {
        if (sortKey === 'value') return investmentCurrentValue(b) - investmentCurrentValue(a)
        if (sortKey === 'return') return returnRate(b) - returnRate(a)
        if (sortKey === 'annualized') return annualizedRate(b) - annualizedRate(a)
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      })
  }, [categoryFilter, filter, investments, sortKey])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const amount = Number(form.amount)
    const profit = Number(form.profit)
    const recordDate = new Date(`${form.date}T00:00:00`)
    const today = new Date(`${todayISO()}T23:59:59`)
    if (!form.name.trim()) return setFormError('请为这笔理财填写一个名称。')
    if (!Number.isFinite(amount) || amount <= 0) return setFormError('购入金额必须大于 0。')
    if (!Number.isFinite(profit)) return setFormError('请输入有效的当前暂时盈利金额。')
    const redemptions = form.redemptions ?? []
    const redeemedTotal = redemptions.reduce((sum, redemption) => sum + redemption.amount, 0)
    if (redemptions.some((redemption) => !redemption.date || redemption.amount <= 0 || new Date(`${redemption.date}T23:59:59`) > today || new Date(`${redemption.date}T00:00:00`) < recordDate)) return setFormError('赎回日期必须在购入日之后且不晚于今天，金额必须大于 0。')
    if (amount - redeemedTotal + profit < 0) return setFormError('当前盈利和赎回金额不能让剩余持有价值变成负数。')
    if (form.lockupDays !== undefined && (!Number.isInteger(Number(form.lockupDays)) || Number(form.lockupDays) <= 0)) return setFormError('封闭期必须是大于 0 的整数天数，或留空。')
    if (!form.date || Number.isNaN(recordDate.getTime()) || recordDate > today) return setFormError('购入日期必须是今天或更早的有效日期。')

    const record: Investment = {
      ...form,
      id: editingId ?? crypto.randomUUID(),
      name: form.name.trim(),
      amount,
      profit,
      lockupDays: form.lockupDays ? Number(form.lockupDays) : undefined,
      category: form.category || '其他',
      redemptions: redemptions.length ? redemptions : undefined,
      note: form.note?.trim(),
    }
    setInvestments((previous) => (editingId ? previous.map((item) => (item.id === editingId ? record : item)) : [record, ...previous]))
    setToast(editingId ? '理财记录已更新' : '新的理财记录已添加')
    setForm(createEmptyForm())
    setEditingId(null)
    setRedemptionDate(todayISO())
    setRedemptionAmount(0)
    setFormError('')
  }

  const startEdit = (investment: Investment) => {
    setEditingId(investment.id)
    setForm({ name: investment.name, amount: investment.amount, date: investment.date, profit: investment.profit, lockupDays: investment.lockupDays, category: investment.category ?? '其他', redemptions: normalizeRedemptions(investment.redemptions), note: investment.note ?? '' })
    setRedemptionDate(todayISO())
    setRedemptionAmount(0)
    setFormError('')
    document.getElementById('record-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(createEmptyForm())
    setRedemptionDate(todayISO())
    setRedemptionAmount(0)
    setFormError('')
  }

  const addRedemption = () => {
    const amount = Number(redemptionAmount)
    const redemption = new Date(`${redemptionDate}T00:00:00`)
    const purchase = new Date(`${form.date}T00:00:00`)
    if (!Number.isFinite(amount) || amount <= 0) return setFormError('赎回金额必须大于 0。')
    if (!redemptionDate || Number.isNaN(redemption.getTime()) || redemption < purchase || redemption > new Date(`${todayISO()}T23:59:59`)) return setFormError('赎回日期必须在购入日之后且不晚于今天。')
    setForm((previous) => ({ ...previous, redemptions: [...(previous.redemptions ?? []), { id: crypto.randomUUID(), date: redemptionDate, amount }] }))
    setRedemptionAmount(0)
    setFormError('')
  }

  const removeRedemption = (id: string) => {
    setForm((previous) => ({ ...previous, redemptions: (previous.redemptions ?? []).filter((redemption) => redemption.id !== id) }))
  }

  const removeInvestment = (id: string) => {
    const investment = investments.find((item) => item.id === id)
    if (!investment || !window.confirm(`确定删除“${investment.name}”吗？`)) return
    setInvestments((previous) => previous.filter((item) => item.id !== id))
    if (editingId === id) cancelEdit()
    setToast('记录已删除')
  }

  const resetAll = () => {
    if (!window.confirm('确定清空全部理财记录吗？此操作不可撤销。')) return
    setInvestments([])
    cancelEdit()
    setToast('所有记录已清空')
  }

  const restoreExamples = () => {
    setInvestments(exampleInvestments)
    setToast('示例数据已加载')
  }

  const clearFilters = () => {
    setFilter('all')
    setCategoryFilter('all')
    setToast('筛选条件已清除')
  }

  const exportData = (type: 'json' | 'csv') => {
    if (type === 'json') {
      downloadFile(`wealth-yield-${todayISO()}.json`, JSON.stringify(investments, null, 2), 'application/json')
    } else {
      const header = ['名称', '购入金额', '购入日期', '当前暂时盈利', '封闭期（天）', '类型', '已赎回金额', '赎回记录(JSON)', '备注']
      const escape = (value: string | number | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`
      const rows = investments.map((item) => [item.name, item.amount, item.date, item.profit, item.lockupDays ?? '', item.category ?? '其他', totalRedeemed(item), JSON.stringify(item.redemptions ?? []), item.note].map(escape).join(','))
      downloadFile(`wealth-yield-${todayISO()}.csv`, `\uFEFF${header.join(',')}\n${rows.join('\n')}`, 'text/csv;charset=utf-8')
    }
    setToast(`已导出 ${type.toUpperCase()} 文件`)
  }

  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const contents = await file.text()
      const parsed = file.name.toLowerCase().endsWith('.csv') ? parseCsvImport(contents) : JSON.parse(contents)
      if (!Array.isArray(parsed)) throw new Error('invalid')
      const cleaned = parsed
        .filter((item): item is Investment => {
          const purchaseDate = item && typeof item.date === 'string' ? new Date(`${item.date}T23:59:59`) : new Date('invalid')
          const amount = Number(item?.amount)
          const profit = Number(item?.profit)
          return Boolean(item && typeof item.name === 'string' && amount > 0 && Number.isFinite(purchaseDate.getTime()) && purchaseDate <= new Date() && Number.isFinite(profit) && profit >= -amount)
        })
        .map((item) => ({ ...item, id: typeof item.id === 'string' ? item.id : crypto.randomUUID(), amount: Number(item.amount), profit: Number(item.profit), lockupDays: item.lockupDays ? Number(item.lockupDays) : undefined, redemptions: normalizeRedemptions(item.redemptions) }))
      if (!cleaned.length) throw new Error('empty')
      setInvestments(cleaned)
      const skipped = parsed.length - cleaned.length
      setToast(skipped ? `已导入 ${cleaned.length} 条记录，跳过 ${skipped} 条无效数据` : `已导入 ${cleaned.length} 条记录`)
    } catch {
      setToast('导入失败：请选择有效的导出 JSON 或 CSV 文件')
    } finally {
      event.target.value = ''
    }
  }

  const profitTone = metrics.totalProfit >= 0 ? 'positive' : 'negative'
  const profitIcon = metrics.totalProfit >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />
  const chartStartValue = trendData[0]?.value ?? 0
  const chartEndValue = trendData[trendData.length - 1]?.value ?? 0
  const chartChange = chartStartValue ? (chartEndValue - chartStartValue) / chartStartValue : 0
  const currentValue = investments.reduce((sum, investment) => sum + investmentCurrentValue(investment), 0)
  const hasActiveFilter = filter !== 'all' || categoryFilter !== 'all'
  const profitableCount = investments.filter((investment) => investment.profit >= 0).length
  const lockedCount = investments.filter((investment) => lockupStatus(investment.date, investment.lockupDays).state === 'active').length
  const largestShare = metrics.totalAmount ? Math.max(...investments.map((investment) => investment.amount)) / metrics.totalAmount : 0
  const formLockup = lockupStatus(form.date, form.lockupDays)
  const formReturn = Number(form.amount) > 0 ? Number(form.profit) / Number(form.amount) : 0
  const formTotalRedeemed = (form.redemptions ?? []).reduce((sum, redemption) => sum + redemption.amount, 0)
  const formCurrentValue = Number(form.amount) - formTotalRedeemed + Number(form.profit)
  const categoryTotals = Object.entries(investments.reduce<Record<string, number>>((totals, investment) => {
    const category = investment.category || '其他'
    totals[category] = (totals[category] || 0) + investment.amount
    return totals
  }, {})).sort(([, amountA], [, amountB]) => amountB - amountA)
  const portfolioSummary = investments.length
    ? `${metrics.totalProfit >= 0 ? '当前组合处于盈利状态' : '当前组合处于回撤状态'} · ${investments.length} 笔持仓 · 平均持有 ${Math.round(metrics.averageDays)} 天`
    : '还没有持仓记录，添加第一笔理财开始追踪。'

  return (
    <main className="min-h-screen overflow-hidden bg-[#080b1c] text-slate-100">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="grid-overlay" />

      <div className="relative mx-auto max-w-[1540px] px-4 py-5 lg:px-7 lg:py-7">
        <header className="topbar glass-panel">
          <div className="brand">
            <div className="brand__mark"><Landmark size={21} /></div>
            <div>
              <div className="brand__name">财富收益看板</div>
              <div className="brand__caption">WEALTH PULSE · 个人资产追踪</div>
            </div>
          </div>
          <div className="topbar__right">
            <button className={`privacy-button ${privacyMode ? 'active' : ''}`} aria-pressed={privacyMode} onClick={() => setPrivacyMode((enabled) => !enabled)}>{privacyMode ? <EyeOff size={15} /> : <Eye size={15} />}{privacyMode ? '隐私已开启' : '隐私模式'}</button>
            <div className="date-pill"><CalendarDays size={15} /> {new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full' }).format(new Date())}</div>
          </div>
        </header>

        <section className="hero">
          <div>
            <div className="eyebrow"><Sparkles size={14} /> 投资组合总览</div>
            <h1>让每一笔收益，都清晰可见。</h1>
            <p>实时归集你的理财数据，以 XIRR 口径呈现更接近真实表现的年化收益。</p>
            <div className={`hero-signal ${metrics.totalProfit >= 0 ? 'hero-signal--positive' : 'hero-signal--negative'}`}><i /> {portfolioSummary}</div>
          </div>
          <div className="hero__actions">
            <button className="soft-button" onClick={() => exportData('json')}><Download size={16} /> 导出数据</button>
            <button className="primary-button" onClick={() => document.getElementById('record-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Plus size={18} /> 添加理财</button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="总投入" value={privacyMode ? '••••••' : formatCurrency(metrics.totalAmount)} hint={`${investments.length} 笔理财记录`} icon={<WalletCards size={19} />} tone="violet" />
          <MetricCard label="当前总收益" value={privacyMode ? '••••••' : formatCurrency(metrics.totalProfit, true)} hint={<span className={profitTone}>{profitIcon} 浮动收益实时汇总</span>} icon={<CircleDollarSign size={19} />} tone="cyan" />
          <MetricCard label="总收益率" value={privacyMode ? '••••' : formatPercent(metrics.returnRate)} hint="累计收益 / 累计投入" icon={<TrendingUp size={19} />} tone="green" />
          <MetricCard label="年化收益率" value={privacyMode ? '••••' : formatPercent(metrics.annualizedRate)} hint={metrics.annualizedMethod === 'xirr' ? 'XIRR · 非定期现金流' : '资金加权估算'} icon={<BarChart3 size={19} />} tone="pink" />
        </section>

        <section className="dashboard-grid mt-5">
          <article className="glass-panel chart-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">表现趋势</span>
                <h2>资产增长曲线</h2>
              </div>
              <div className="chart-heading-right"><div className="live-status" role="status"><i /> 本地已保存 · {new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(savedAt)}</div><span className={chartChange >= 0 ? 'chart-change positive' : 'chart-change negative'}>{chartChange >= 0 ? '+' : ''}{(chartChange * 100).toFixed(2)}% 区间变化</span></div>
            </div>
            <div className="range-tabs" role="tablist" aria-label="趋势时间范围">{(['30D', '90D', '1Y', 'ALL'] as ChartRange[]).map((range) => <button key={range} className={chartRange === range ? 'selected' : ''} onClick={() => setChartRange(range)} role="tab" aria-selected={chartRange === range}>{range === 'ALL' ? '全部' : range === '1Y' ? '1 年' : range === '90D' ? '90 天' : '30 天'}</button>)}</div>
            <div className="chart-key"><span><i className="key-dot key-dot--cyan" /> 组合当前价值</span><span><i className="key-dot key-dot--purple" /> 累计收益（估算）</span><span className="chart-estimate-note">基于当前持仓推算</span></div>
            <div className="h-[296px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 12, right: 6, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="valueGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#38d9ff" stopOpacity={0.42} /><stop offset="100%" stopColor="#38d9ff" stopOpacity={0} /></linearGradient>
                    <linearGradient id="profitGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity={0.34} /><stop offset="100%" stopColor="#a78bfa" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid stroke="#334155" strokeDasharray="3 6" vertical={false} opacity={0.55} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8191ad', fontSize: 12 }} dy={10} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: '#12192d', border: '1px solid #32415f', borderRadius: 12, boxShadow: '0 15px 35px rgba(0,0,0,.28)' }} labelStyle={{ color: '#cbd5e1' }} itemStyle={{ color: '#e2e8f0' }} formatter={(value, name) => [privacyMode ? '••••••' : formatCurrency(Number(value ?? 0)), String(name) === 'value' ? '组合当前价值' : '累计收益']} />
                  <Area type="monotone" dataKey="value" stroke="#38d9ff" strokeWidth={3} fill="url(#valueGradient)" activeDot={{ r: 5, fill: '#38d9ff', stroke: '#0a1022', strokeWidth: 3 }} />
                  <Area type="monotone" dataKey="profit" stroke="#a78bfa" strokeWidth={2.5} fill="url(#profitGradient)" activeDot={{ r: 4, fill: '#a78bfa', stroke: '#0a1022', strokeWidth: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="glass-panel portfolio-panel">
            <div className="panel-heading"><div><span className="eyebrow">PORTFOLIO CHECK</span><h2>组合检查</h2></div><div className="orbital-icon"><TrendingUp size={20} /></div></div>
            <div className="inspection-hero"><span>当前估算价值</span><strong>{privacyMode ? '••••••' : formatCurrency(currentValue)}</strong><small className={metrics.totalProfit >= 0 ? 'positive' : 'negative'}>{privacyMode ? '••••' : formatPercent(metrics.returnRate)} 累计回报</small></div>
            <div className="inspection-grid">
              <div><span>盈利项目</span><strong>{profitableCount} / {investments.length || 0}</strong></div>
              <div><span>封闭中</span><strong>{lockedCount} 笔</strong></div>
              <div><span>平均持有</span><strong>{Math.round(metrics.averageDays || 0)} 天</strong></div>
              <div><span>最大单笔占比</span><strong>{privacyMode ? '••••' : `${(largestShare * 100).toFixed(1)}%`}</strong></div>
            </div>
            <div className="concentration-bar"><i style={{ width: `${Math.min(100, largestShare * 100)}%` }} /></div><small className="concentration-note">最大单笔投入占总投入比例</small>
            <div className="allocation-list"><span className="allocation-title">资产类型分布</span>{categoryTotals.slice(0, 3).map(([category, amount]) => <div className="allocation-row" key={category}><span><i className="allocation-dot" />{category}</span><strong>{privacyMode ? '••••' : `${((amount / Math.max(1, metrics.totalAmount)) * 100).toFixed(1)}%`}</strong></div>)}</div>
          </article>
        </section>

        <section className="workspace mt-5">
          <article className="glass-panel form-panel" id="record-form">
            <div className="panel-heading"><div><span className="eyebrow">NEW POSITION</span><h2>{editingId ? '编辑理财记录' : '录入一笔理财'}</h2></div>{editingId && <button onClick={cancelEdit} className="icon-button" aria-label="取消编辑"><X size={18} /></button>}</div>
            <form onSubmit={handleSubmit} className="record-form">
              <label>理财名称<input value={form.name} maxLength={40} placeholder="如：稳健理财 A" onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} /></label>
              <div className="form-row">
                <label>购入金额（元）<input value={form.amount || ''} type="number" min="0.01" step="0.01" placeholder="0.00" onChange={(event) => setForm((previous) => ({ ...previous, amount: Number(event.target.value) }))} /></label>
                <label>购入日期<input value={form.date} type="date" max={todayISO()} onBlur={(event) => setForm((previous) => ({ ...previous, date: event.currentTarget.value }))} /></label>
              </div>
              <label>封闭期（天） <span>（选填）</span><input value={form.lockupDays || ''} type="number" min="1" step="1" placeholder="如：180" onChange={(event) => setForm((previous) => ({ ...previous, lockupDays: event.target.value ? Number(event.target.value) : undefined }))} /></label>
              {form.lockupDays && formLockup.unlockDate && <div className="field-hint"><CalendarDays size={13} /> 预计 {formLockup.state === 'unlocked' ? '已解锁' : `解锁于 ${formLockup.unlockDate} · 剩余 ${formLockup.daysRemaining} 天`}</div>}
              <label>理财类型 <span>（选填）</span><select value={form.category || '其他'} onChange={(event) => setForm((previous) => ({ ...previous, category: event.target.value }))}>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
              <label>当前暂时盈利（元）<input value={form.profit || ''} type="number" step="0.01" placeholder="可填写负数，如 -200" onChange={(event) => setForm((previous) => ({ ...previous, profit: Number(event.target.value) }))} /></label>
              <div className="redemptions-box"><div className="redemptions-heading"><span>部分赎回 <em>（可选）</em></span><small>按现金流记录</small></div>{(form.redemptions ?? []).map((redemption) => <div className="redemption-row" key={redemption.id}><span>{redemption.date}</span><strong>{formatCurrency(redemption.amount)}</strong><button type="button" aria-label={`删除 ${redemption.date} 的赎回记录`} onClick={() => removeRedemption(redemption.id)}><X size={14} /></button></div>)}<div className="redemption-entry"><input aria-label="赎回日期" type="date" min={form.date} max={todayISO()} value={redemptionDate} onBlur={(event) => setRedemptionDate(event.currentTarget.value)} /><input aria-label="赎回金额" type="number" min="0.01" step="0.01" placeholder="赎回金额" value={redemptionAmount || ''} onChange={(event) => setRedemptionAmount(Number(event.target.value))} /><button type="button" className="icon-button" aria-label="添加赎回记录" onClick={addRedemption}><Plus size={16} /></button></div><small className="redemptions-summary">已赎回 {formatCurrency(formTotalRedeemed)} · 剩余价值 {formatCurrency(formCurrentValue)}</small></div>
              {Number(form.amount) > 0 && <div className="form-preview"><div><span>录入后当前价值</span><strong>{formatCurrency(formCurrentValue)}</strong></div><div><span>收益率</span><strong className={formReturn >= 0 ? 'positive' : 'negative'}>{formatPercent(formReturn)}</strong></div></div>}
              <label>备注 <span>（选填）</span><textarea value={form.note} maxLength={100} placeholder="如：产品期限、风险等级等" rows={2} onChange={(event) => setForm((previous) => ({ ...previous, note: event.target.value }))} /></label>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <button type="submit" className="primary-button form-submit">{editingId ? <CheckCircle2 size={18} /> : <Plus size={18} />}{editingId ? '保存修改' : '添加记录'}</button>
              <button type="button" onClick={cancelEdit} className="clear-form">{editingId ? '放弃修改' : '清空表单'}</button>
            </form>
            <div className="formula-note"><Sparkles size={15} /><span>年化按 XIRR 计算；赎回会作为对应日期的现金流，封闭期只用于追踪解锁时间。</span></div>
          </article>

          <article className="glass-panel records-panel">
            <div className="records-header">
              <div><span className="eyebrow">POSITIONS</span><h2>理财持仓明细 <b>{filter === 'all' && categoryFilter === 'all' ? investments.length : `${visibleInvestments.length}/${investments.length}`}</b></h2></div>
              <div className="records-actions">
                <button className="icon-button" aria-label="导入 JSON 或 CSV" title="导入 JSON 或 CSV" onClick={() => importRef.current?.click()}><FileUp size={17} /></button>
                <button className="icon-button" aria-label="导出 CSV" title="导出 CSV" onClick={() => exportData('csv')}><Download size={17} /></button>
                <button className="icon-button danger-button" aria-label="清空所有记录" title="清空所有记录" onClick={resetAll}><RotateCcw size={17} /></button>
                <input ref={importRef} className="hidden" type="file" accept="application/json,.json,text/csv,.csv" onChange={importData} />
              </div>
            </div>
            <div className="controls-row">
              <div className="filter-group">
                {(['all', 'profit', 'loss', 'locked'] as FilterKey[]).map((key) => <button key={key} className={filter === key ? 'selected' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>{key === 'all' ? '全部' : key === 'profit' ? '盈利' : key === 'loss' ? '亏损' : '封闭中'}</button>)}
              </div>
              <div className="select-controls"><label className="sort-select">类型：<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">全部类型</option>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label className="sort-select">排序：<select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}><option value="date">购入日期</option><option value="value">当前价值</option><option value="return">收益率</option><option value="annualized">年化收益率</option></select></label></div>
            </div>
            <p className="mobile-table-hint">左右滑动查看完整明细</p>
            {visibleInvestments.length ? (
              <div className="records-table-wrap">
                <table className="records-table">
                  <thead><tr><th>理财名称</th><th>购入金额</th><th>已赎回</th><th>当前价值</th><th>购入日期</th><th>持有</th><th>封闭期</th><th>当前收益</th><th>收益率</th><th>年化收益</th><th aria-label="操作" /></tr></thead>
                  <tbody>{visibleInvestments.map((investment) => {
                    const isPositive = investment.profit >= 0
                    return <tr key={investment.id}>
                      <td><strong>{investment.name}</strong><small><span className={`category-label ${categoryClass(investment.category)}`}>{investment.category || '其他'}</span>{investment.note || '未添加备注'}</small></td>
                      <td>{privacyMode ? '••••••' : formatCurrency(investment.amount)}</td>
                      <td>{investment.redemptions?.length ? <><span>{privacyMode ? '••••••' : formatCurrency(totalRedeemed(investment))}</span><small>{investment.redemptions.length} 次</small></> : '—'}</td>
                      <td>{privacyMode ? '••••••' : formatCurrency(investmentCurrentValue(investment))}</td>
                      <td>{investment.date}</td>
                      <td>{daysHeld(investment.date)} 天</td>
                      <td>{(() => { const lockup = lockupStatus(investment.date, investment.lockupDays); return lockup.state === 'none' ? <span className="lockup-badge lockup-badge--none">未设置</span> : lockup.state === 'unlocked' ? <span className="lockup-badge lockup-badge--done"><b>已解锁</b><small>{lockup.unlockDate}</small></span> : <span className="lockup-badge lockup-badge--active"><b>剩 {lockup.daysRemaining} 天</b><small>解锁 {lockup.unlockDate}</small></span> })()}</td>
                      <td className={isPositive ? 'positive' : 'negative'}>{privacyMode ? '••••••' : formatCurrency(investment.profit, true)}</td>
                      <td className={isPositive ? 'positive' : 'negative'}>{privacyMode ? '••••' : formatPercent(returnRate(investment))}</td>
                      <td className={annualizedRate(investment) >= 0 ? 'positive' : 'negative'}>{privacyMode ? '••••' : formatPercent(annualizedRate(investment))}</td>
                      <td><div className="row-actions"><button onClick={() => startEdit(investment)} aria-label={`编辑 ${investment.name}`}><Edit3 size={15} /></button><button onClick={() => removeInvestment(investment.id)} aria-label={`删除 ${investment.name}`}><Trash2 size={15} /></button></div></td>
                    </tr>
                  })}</tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state"><LoaderCircle size={28} /><h3>{hasActiveFilter ? '没有符合当前筛选的记录' : '还没有理财记录'}</h3><p>{hasActiveFilter ? '调整筛选条件，或清除筛选查看全部持仓。' : '从左侧添加一笔投资，开始追踪收益表现。'}</p><button className="soft-button empty-state__button" onClick={hasActiveFilter ? clearFilters : restoreExamples}>{hasActiveFilter ? <RotateCcw size={15} /> : <Sparkles size={15} />} {hasActiveFilter ? '清除筛选' : '加载示例数据'}</button></div>
            )}
          </article>
        </section>
      </div>

      {toast && <div className="toast" role="status" aria-live="polite"><CheckCircle2 size={17} /> {toast}</div>}
    </main>
  )
}

export default App
