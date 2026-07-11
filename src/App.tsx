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
  ChevronDown,
  CircleDollarSign,
  Download,
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
import type { FilterKey, Investment, SortKey } from './types'
import {
  annualizedRate,
  daysHeld,
  formatCurrency,
  formatPercent,
  portfolioMetrics,
  returnRate,
  lockupStatus,
  todayISO,
} from './utils/finance'

const STORAGE_KEY = 'wealth-yield-dashboard-investments'

type FormValues = Omit<Investment, 'id'>

const createEmptyForm = (): FormValues => ({
  name: '',
  amount: 0,
  date: todayISO(),
  profit: 0,
  lockupDays: undefined,
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

function downloadFile(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function makeTrendData(investments: Investment[]) {
  const now = new Date()
  const earliest = investments.length
    ? Math.min(...investments.map((investment) => new Date(`${investment.date}T00:00:00`).getTime()))
    : now.getTime() - 30 * 86_400_000
  const span = Math.max(now.getTime() - earliest, 10 * 86_400_000)

  return Array.from({ length: 12 }, (_, index) => {
    const point = new Date(earliest + (span * index) / 11)
    const totals = investments.reduce(
      (acc, investment) => {
        const purchaseTime = new Date(`${investment.date}T00:00:00`).getTime()
        if (point.getTime() < purchaseTime) return acc
        const progression = Math.min(1, Math.max(0, (point.getTime() - purchaseTime) / Math.max(1, now.getTime() - purchaseTime)))
        acc.invested += investment.amount
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
  const [toast, setToast] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(investments))
  }, [investments])

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const metrics = useMemo(() => portfolioMetrics(investments), [investments])
  const trendData = useMemo(() => makeTrendData(investments), [investments])
  const visibleInvestments = useMemo(() => {
    return [...investments]
      .filter((investment) => filter === 'all' || (filter === 'profit' ? investment.profit >= 0 : investment.profit < 0))
      .sort((a, b) => {
        if (sortKey === 'return') return returnRate(b) - returnRate(a)
        if (sortKey === 'annualized') return annualizedRate(b) - annualizedRate(a)
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      })
  }, [filter, investments, sortKey])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const amount = Number(form.amount)
    const profit = Number(form.profit)
    const recordDate = new Date(`${form.date}T00:00:00`)
    const today = new Date(`${todayISO()}T23:59:59`)
    if (!form.name.trim()) return setFormError('请为这笔理财填写一个名称。')
    if (!Number.isFinite(amount) || amount <= 0) return setFormError('购入金额必须大于 0。')
    if (!Number.isFinite(profit)) return setFormError('请输入有效的当前暂时盈利金额。')
    if (form.lockupDays !== undefined && (!Number.isInteger(Number(form.lockupDays)) || Number(form.lockupDays) <= 0)) return setFormError('封闭期必须是大于 0 的整数天数，或留空。')
    if (!form.date || Number.isNaN(recordDate.getTime()) || recordDate > today) return setFormError('购入日期必须是今天或更早的有效日期。')

    const record: Investment = {
      ...form,
      id: editingId ?? crypto.randomUUID(),
      name: form.name.trim(),
      amount,
      profit,
      lockupDays: form.lockupDays ? Number(form.lockupDays) : undefined,
      note: form.note?.trim(),
    }
    setInvestments((previous) => (editingId ? previous.map((item) => (item.id === editingId ? record : item)) : [record, ...previous]))
    setToast(editingId ? '理财记录已更新' : '新的理财记录已添加')
    setForm(createEmptyForm())
    setEditingId(null)
    setFormError('')
  }

  const startEdit = (investment: Investment) => {
    setEditingId(investment.id)
    setForm({ name: investment.name, amount: investment.amount, date: investment.date, profit: investment.profit, lockupDays: investment.lockupDays, note: investment.note ?? '' })
    setFormError('')
    document.getElementById('record-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(createEmptyForm())
    setFormError('')
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

  const exportData = (type: 'json' | 'csv') => {
    if (type === 'json') {
      downloadFile(`wealth-yield-${todayISO()}.json`, JSON.stringify(investments, null, 2), 'application/json')
    } else {
      const header = ['名称', '购入金额', '购入日期', '当前暂时盈利', '封闭期（天）', '备注']
      const escape = (value: string | number | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`
      const rows = investments.map((item) => [item.name, item.amount, item.date, item.profit, item.lockupDays ?? '', item.note].map(escape).join(','))
      downloadFile(`wealth-yield-${todayISO()}.csv`, `\uFEFF${header.join(',')}\n${rows.join('\n')}`, 'text/csv;charset=utf-8')
    }
    setToast(`已导出 ${type.toUpperCase()} 文件`)
  }

  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      if (!Array.isArray(parsed)) throw new Error('invalid')
      const cleaned = parsed
        .filter((item): item is Investment => item && typeof item.name === 'string' && Number(item.amount) > 0 && typeof item.date === 'string' && Number.isFinite(Number(item.profit)))
        .map((item) => ({ ...item, id: typeof item.id === 'string' ? item.id : crypto.randomUUID(), amount: Number(item.amount), profit: Number(item.profit), lockupDays: item.lockupDays ? Number(item.lockupDays) : undefined }))
      if (!cleaned.length) throw new Error('empty')
      setInvestments(cleaned)
      setToast(`已导入 ${cleaned.length} 条记录`)
    } catch {
      setToast('导入失败：请选择有效的导出 JSON 文件')
    } finally {
      event.target.value = ''
    }
  }

  const profitTone = metrics.totalProfit >= 0 ? 'positive' : 'negative'
  const profitIcon = metrics.totalProfit >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />

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
            <div className="date-pill"><CalendarDays size={15} /> {new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full' }).format(new Date())}</div>
            <button className="icon-button mobile-only" aria-label="菜单"><ChevronDown size={19} /></button>
          </div>
        </header>

        <section className="hero">
          <div>
            <div className="eyebrow"><Sparkles size={14} /> 投资组合总览</div>
            <h1>让每一笔收益，都清晰可见。</h1>
            <p>实时归集你的理财数据，以 XIRR 口径呈现更接近真实表现的年化收益。</p>
          </div>
          <div className="hero__actions">
            <button className="soft-button" onClick={() => exportData('json')}><Download size={16} /> 导出数据</button>
            <button className="primary-button" onClick={() => document.getElementById('record-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Plus size={18} /> 添加理财</button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="总投入" value={formatCurrency(metrics.totalAmount)} hint={`${investments.length} 笔理财记录`} icon={<WalletCards size={19} />} tone="violet" />
          <MetricCard label="当前总收益" value={formatCurrency(metrics.totalProfit, true)} hint={<span className={profitTone}>{profitIcon} 浮动收益实时汇总</span>} icon={<CircleDollarSign size={19} />} tone="cyan" />
          <MetricCard label="总收益率" value={formatPercent(metrics.returnRate)} hint="累计收益 / 累计投入" icon={<TrendingUp size={19} />} tone="green" />
          <MetricCard label="年化收益率" value={formatPercent(metrics.annualizedRate)} hint={metrics.annualizedMethod === 'xirr' ? 'XIRR · 非定期现金流' : '资金加权估算'} icon={<BarChart3 size={19} />} tone="pink" />
        </section>

        <section className="dashboard-grid mt-5">
          <article className="glass-panel chart-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">表现趋势</span>
                <h2>资产增长曲线</h2>
              </div>
              <div className="live-status"><i /> 数据已同步</div>
            </div>
            <div className="chart-key"><span><i className="key-dot key-dot--cyan" /> 组合当前价值</span><span><i className="key-dot key-dot--purple" /> 累计收益</span></div>
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
                  <Tooltip contentStyle={{ background: '#12192d', border: '1px solid #32415f', borderRadius: 12, boxShadow: '0 15px 35px rgba(0,0,0,.28)' }} labelStyle={{ color: '#cbd5e1' }} itemStyle={{ color: '#e2e8f0' }} formatter={(value, name) => [formatCurrency(Number(value ?? 0)), String(name) === 'value' ? '组合当前价值' : '累计收益']} />
                  <Area type="monotone" dataKey="value" stroke="#38d9ff" strokeWidth={3} fill="url(#valueGradient)" activeDot={{ r: 5, fill: '#38d9ff', stroke: '#0a1022', strokeWidth: 3 }} />
                  <Area type="monotone" dataKey="profit" stroke="#a78bfa" strokeWidth={2.5} fill="url(#profitGradient)" activeDot={{ r: 4, fill: '#a78bfa', stroke: '#0a1022', strokeWidth: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="glass-panel portfolio-panel">
            <div className="panel-heading"><div><span className="eyebrow">PORTFOLIO HEALTH</span><h2>组合健康度</h2></div><div className="orbital-icon"><TrendingUp size={20} /></div></div>
            <div className="portfolio-score"><span>{Math.min(99, Math.max(0, Math.round(68 + metrics.returnRate * 450)))}</span><small>/ 100</small></div>
            <div className="score-bar"><i style={{ width: `${Math.min(99, Math.max(2, 68 + metrics.returnRate * 450))}%` }} /></div>
            <div className="health-items">
              <div><span>平均持有周期</span><strong>{Math.round(metrics.averageDays || 0)} 天</strong></div>
              <div><span>盈利项目占比</span><strong>{investments.length ? `${Math.round((investments.filter((item) => item.profit >= 0).length / investments.length) * 100)}%` : '—'}</strong></div>
              <div><span>计算口径</span><strong>{metrics.annualizedMethod === 'xirr' ? 'XIRR 年化' : '加权估算'}</strong></div>
            </div>
          </article>
        </section>

        <section className="workspace mt-5">
          <article className="glass-panel form-panel" id="record-form">
            <div className="panel-heading"><div><span className="eyebrow">NEW POSITION</span><h2>{editingId ? '编辑理财记录' : '录入一笔理财'}</h2></div>{editingId && <button onClick={cancelEdit} className="icon-button" aria-label="取消编辑"><X size={18} /></button>}</div>
            <form onSubmit={handleSubmit} className="record-form">
              <label>理财名称<input value={form.name} maxLength={40} placeholder="如：稳健理财 A" onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <div className="form-row">
                <label>购入金额（元）<input value={form.amount || ''} type="number" min="0.01" step="0.01" placeholder="0.00" onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} /></label>
                <label>购入日期<input value={form.date} type="date" max={todayISO()} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
              </div>
              <label>封闭期（天） <span>（选填）</span><input value={form.lockupDays || ''} type="number" min="1" step="1" placeholder="如：180" onChange={(event) => setForm({ ...form, lockupDays: event.target.value ? Number(event.target.value) : undefined })} /></label>
              <label>当前暂时盈利（元）<input value={form.profit || ''} type="number" step="0.01" placeholder="可填写负数，如 -200" onChange={(event) => setForm({ ...form, profit: Number(event.target.value) })} /></label>
              <label>备注 <span>（选填）</span><textarea value={form.note} maxLength={100} placeholder="如：产品期限、风险等级等" rows={2} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
              {formError && <p className="form-error">{formError}</p>}
              <button type="submit" className="primary-button form-submit">{editingId ? <CheckCircle2 size={18} /> : <Plus size={18} />}{editingId ? '保存修改' : '添加记录'}</button>
              <button type="button" onClick={cancelEdit} className="clear-form">{editingId ? '放弃修改' : '清空表单'}</button>
            </form>
            <div className="formula-note"><Sparkles size={15} /><span>年化按 XIRR 计算；封闭期只用于追踪解锁时间，不影响收益计算。</span></div>
          </article>

          <article className="glass-panel records-panel">
            <div className="records-header">
              <div><span className="eyebrow">POSITIONS</span><h2>理财持仓明细 <b>{investments.length}</b></h2></div>
              <div className="records-actions">
                <button className="icon-button" title="导入 JSON" onClick={() => importRef.current?.click()}><FileUp size={17} /></button>
                <button className="icon-button" title="导出 CSV" onClick={() => exportData('csv')}><Download size={17} /></button>
                <button className="icon-button danger-button" title="清空所有记录" onClick={resetAll}><RotateCcw size={17} /></button>
                <input ref={importRef} className="hidden" type="file" accept="application/json,.json" onChange={importData} />
              </div>
            </div>
            <div className="controls-row">
              <div className="filter-group">
                {(['all', 'profit', 'loss'] as FilterKey[]).map((key) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{key === 'all' ? '全部' : key === 'profit' ? '盈利' : '亏损'}</button>)}
              </div>
              <label className="sort-select">排序：<select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}><option value="date">购入日期</option><option value="return">收益率</option><option value="annualized">年化收益率</option></select></label>
            </div>
            {visibleInvestments.length ? (
              <div className="records-table-wrap">
                <table className="records-table">
                  <thead><tr><th>理财名称</th><th>购入金额</th><th>购入日期</th><th>持有</th><th>封闭期</th><th>当前收益</th><th>收益率</th><th>年化收益</th><th aria-label="操作" /></tr></thead>
                  <tbody>{visibleInvestments.map((investment) => {
                    const isPositive = investment.profit >= 0
                    return <tr key={investment.id}>
                      <td><strong>{investment.name}</strong><small>{investment.note || '未添加备注'}</small></td>
                      <td>{formatCurrency(investment.amount)}</td>
                      <td>{investment.date}</td>
                      <td>{daysHeld(investment.date)} 天</td>
                      <td>{(() => { const lockup = lockupStatus(investment.date, investment.lockupDays); return lockup.state === 'none' ? <span className="lockup-badge lockup-badge--none">未设置</span> : lockup.state === 'unlocked' ? <span className="lockup-badge lockup-badge--done">已解锁</span> : <span className="lockup-badge lockup-badge--active">剩 {lockup.daysRemaining} 天</span> })()}</td>
                      <td className={isPositive ? 'positive' : 'negative'}>{formatCurrency(investment.profit, true)}</td>
                      <td className={isPositive ? 'positive' : 'negative'}>{formatPercent(returnRate(investment))}</td>
                      <td className={annualizedRate(investment) >= 0 ? 'positive' : 'negative'}>{formatPercent(annualizedRate(investment))}</td>
                      <td><div className="row-actions"><button onClick={() => startEdit(investment)} aria-label={`编辑 ${investment.name}`}><Edit3 size={15} /></button><button onClick={() => removeInvestment(investment.id)} aria-label={`删除 ${investment.name}`}><Trash2 size={15} /></button></div></td>
                    </tr>
                  })}</tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state"><LoaderCircle size={28} /><h3>还没有符合条件的理财记录</h3><p>从左侧添加一笔投资，开始追踪收益表现。</p></div>
            )}
          </article>
        </section>
      </div>

      {toast && <div className="toast"><CheckCircle2 size={17} /> {toast}</div>}
    </main>
  )
}

export default App
