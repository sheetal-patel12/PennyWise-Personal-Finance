import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Wallet, LayoutDashboard, ReceiptText, Repeat, PiggyBank, Sparkles, LogOut, Plus, Trash2, TrendingUp, TrendingDown, CalendarDays, X } from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api'
const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n || 0))
const today = () => new Date().toISOString().slice(0, 10)
const categories = ['Food', 'Travel', 'Shopping', 'Bills', 'Healthcare', 'Education', 'Entertainment', 'Rent', 'Salary', 'Other']
const api = token => axios.create({ baseURL: API, headers: token ? { Authorization: `Bearer ${token}` } : {} })

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('penny_token') || '')
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('penny_user') || 'null'))
  const [authMode, setAuthMode] = useState('login')
  const [page, setPage] = useState('dashboard')
  const [dashboard, setDashboard] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [editingTxn, setEditingTxn] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [budgets, setBudgets] = useState([])
  const [insights, setInsights] = useState('')
  const [aiSource, setAiSource] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [showTxn, setShowTxn] = useState(false)
  const [showSub, setShowSub] = useState(false)
  const [txn, setTxn] = useState({ title:'', amount:'', kind:'expense', category:'Food', date:today(), note:'' })
  const [sub, setSub] = useState({ name:'', amount:'', billing_cycle:'Monthly', next_renewal:today(), category:'Entertainment' })
  const [budget, setBudget] = useState({ category:'Food', amount:'', month:today().slice(0,7) })
  const [auth, setAuth] = useState({ name:'', email:'', password:'' })

  const load = async () => {
    if (!token) return
    try {
      const a = api(token)
      const [d,t,s,b] = await Promise.all([a.get('/dashboard'), a.get('/transactions'), a.get('/subscriptions'), a.get('/budgets')])
      setDashboard(d.data); setTransactions(t.data); setSubscriptions(s.data); setBudgets(b.data); setNotice('')
    } catch (e) {
      if (e.response?.status === 401) logout()
      else setNotice(e.response?.data?.error || 'Could not connect to the backend. Is Flask running?')
    }
  }
  useEffect(() => { load() }, [token])
  const logout = () => { localStorage.removeItem('penny_token'); localStorage.removeItem('penny_user'); setToken(''); setUser(null) }

  const submitAuth = async e => {
    e.preventDefault(); setBusy(true); setNotice('')
    try {
      const path = authMode === 'login' ? '/auth/login' : '/auth/register'
      const { data } = await api().post(path, auth)
      localStorage.setItem('penny_token', data.token); localStorage.setItem('penny_user', JSON.stringify(data.user))
      setToken(data.token); setUser(data.user)
    } catch (e) { setNotice(e.response?.data?.error || 'Authentication failed. Check that the backend is running.') }
    finally { setBusy(false) }
  }
  const addTxn = async e => {
    e.preventDefault(); setBusy(true)
    try { await api(token).post('/transactions', txn); setShowTxn(false); setTxn({title:'',amount:'',kind:'expense',category:'Food',date:today(),note:''}); await load() }
    catch(e) { setNotice(e.response?.data?.error || 'Could not save transaction.') }
    finally { setBusy(false) }
  }
  const updateTxn = async e => {
  e.preventDefault()
  try {
    await api(token).put(`/transactions/${editingTxn.id}`, editingTxn)
    setEditingTxn(null)
    await load()
    setNotice('Transaction updated successfully!')
  } catch (e) {
    setNotice(e.response?.data?.error || 'Could not update transaction.')
  }
}
  const addSub = async e => {
    e.preventDefault(); setBusy(true)
    try { await api(token).post('/subscriptions', sub); setShowSub(false); setSub({name:'',amount:'',billing_cycle:'Monthly',next_renewal:today(),category:'Entertainment'}); await load() }
    catch(e) { setNotice(e.response?.data?.error || 'Could not save subscription.') }
    finally { setBusy(false) }
  }
  const addBudget = async e => {
    e.preventDefault()
    try { await api(token).post('/budgets', budget); setBudget({...budget,amount:''}); await load() }
    catch(e) { setNotice(e.response?.data?.error || 'Could not save budget.') }
  }
  const deleteTxn = async id => { if(confirm('Delete this transaction?')) { await api(token).delete(`/transactions/${id}`); load() } }
  const deleteSub = async id => { if(confirm('Delete this subscription?')) { await api(token).delete(`/subscriptions/${id}`); load() } }
  const getAI = async () => {
    setBusy(true)
    setInsights('')
    setNotice('')

    try {
        const { data } = await api(token).post('/ai/insights')
        setInsights(data.insights)
        setAiSource(data.source)
        setNotice('')
    } catch (e) {
        setNotice(
            e.response?.data?.error ||
            'AI insights could not be generated.'
        )
    } finally {
        setBusy(false)
    }
}
  const chartData = dashboard?.category_breakdown || []
  const nav = [
    ['dashboard','Overview',LayoutDashboard], ['transactions','Transactions',ReceiptText],
    ['subscriptions','Subscriptions',Repeat], ['budgets','Budgets',PiggyBank], ['ai','AI Insights',Sparkles]
  ]

  if (!token) return <div className="auth-shell"><div className="auth-card"><div className="brand-mark"><Wallet size={25}/></div><p className="eyebrow">PENNYWISE FINANCE</p><h1>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h1><p className="muted">A clearer picture of where your money goes.</p>
    <form onSubmit={submitAuth} className="form-stack">
      {authMode === 'register' && <label>Full name<input required value={auth.name} onChange={e=>setAuth({...auth,name:e.target.value})} placeholder="Your name"/></label>}
      <label>Email address<input required type="email" value={auth.email} onChange={e=>setAuth({...auth,email:e.target.value})} placeholder="you@example.com"/></label>
      <label>Password<input required minLength="8" type="password" value={auth.password} onChange={e=>setAuth({...auth,password:e.target.value})} placeholder="At least 8 characters"/></label>
      <button className="primary full" disabled={busy}>{busy?'Please wait…':authMode==='login'?'Sign in':'Create account'}</button>
    </form>
    {notice && <p className="error">{notice}</p>}
    <p className="switch-auth">{authMode==='login'?"New to PennyWise?":"Already have an account?"} <button className="link" onClick={()=>{setAuthMode(authMode==='login'?'register':'login');setNotice('')}}>{authMode==='login'?'Create account':'Sign in'}</button></p>
  </div></div>

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><Wallet size={22}/></span><span>PennyWise<small>PERSONAL FINANCE</small></span></div>
      <div className="nav-label">WORKSPACE</div>{nav.map(([id,label,Icon])=><button key={id} className={`nav-item ${page===id?'active':''}`} onClick={()=>setPage(id)}><Icon size={18}/>{label}</button>)}
      <div className="sidebar-bottom"><div className="profile"><div className="avatar">{(user?.name||'U').slice(0,1).toUpperCase()}</div><div><b>{user?.name||'User'}</b><small>{user?.email}</small></div></div><button className="nav-item" onClick={logout}><LogOut size={18}/>Sign out</button></div>
    </aside>
    <main className="main"><header className="topbar"><div><p className="eyebrow">PERSONAL FINANCE / {page.toUpperCase()}</p><h2>{page==='dashboard'?'Your financial overview':page==='transactions'?'Transactions':page==='subscriptions'?'Subscriptions':page==='budgets'?'Monthly budgets':'AI money coach'}</h2></div><button className="primary" onClick={()=>page==='subscriptions'?setShowSub(true):setShowTxn(true)}><Plus size={17}/> {page==='subscriptions'?'Add subscription':'Add transaction'}</button></header>
      {notice && <div className="notice">{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
      {page==='dashboard' && <>{!dashboard ? <div className="panel">Loading your dashboard…</div> : <>
        <div className="welcome"><div><span className="eyebrow light">YOUR MONEY, IN FOCUS</span><h3>Good to see you, {user?.name?.split(' ')[0]||'there'}.</h3><p>Here is your snapshot for {dashboard.month}.</p></div><div className="welcome-icon"><Wallet size={34}/></div></div>
        <div className="stats-grid"><Stat title="Total income" value={money(dashboard.income)} icon={TrendingUp} tone="green"/><Stat title="Total expenses" value={money(dashboard.expenses)} icon={TrendingDown} tone="red"/><Stat title="Net balance" value={money(dashboard.balance)} icon={Wallet} tone="blue"/><Stat title="Monthly subscriptions" value={money(dashboard.monthly_subscription_estimate)} icon={Repeat} tone="purple"/></div>
        <div className="content-grid"><section className="panel"><div className="panel-head"><div><h3>Spending by category</h3><p className="muted">This month's recorded expenses</p></div></div>{chartData.length ? <div className="chart"><ResponsiveContainer width="100%" height={270}><PieChart><Pie data={chartData} dataKey="amount" nameKey="category" innerRadius={65} outerRadius={95} paddingAngle={3}>{chartData.map((x,i)=><Cell key={x.category} fill={['#6c63ff','#20b486','#f3a94b','#e36b7d','#3997d8','#9b78cf'][i%6]}/>)}</Pie><Tooltip formatter={v=>money(v)}/><Legend/></PieChart></ResponsiveContainer></div>:<Empty text="Add a few expenses to see your category breakdown."/>}</section>
        <section className="panel"><div className="panel-head"><div><h3>Recent activity</h3><p className="muted">Your latest transactions</p></div><button className="text-button" onClick={()=>setPage('transactions')}>View all</button></div><TransactionList rows={dashboard.recent_transactions||[]} onDelete={deleteTxn} onEdit={t=>setEditingTxn({...t})}/>
            </section>
      </div>
      </>}
      </>}
      {page==='transactions' && <section className="panel"><div className="panel-head"><div><h3>All transactions</h3><p className="muted">Track every rupee coming in and going out.</p></div></div><TransactionList rows={transactions} onDelete={deleteTxn} onEdit={t=>setEditingTxn({...t})} empty="No transactions yet. Add your first income or expense."/>
      </section>}
      {page==='subscriptions' && <section className="panel"><div className="panel-head"><div><h3>Your subscriptions</h3><p className="muted">Keep an eye on recurring charges and renewal dates.</p></div><button className="primary" onClick={()=>setShowSub(true)}><Plus size={16}/> Add subscription</button></div>{subscriptions.length===0?<Empty text="No subscriptions added yet."/>:<div className="table-wrap"><table><thead><tr><th>Service</th><th>Billing</th><th>Amount</th><th>Next renewal</th><th></th></tr></thead><tbody>{subscriptions.map(s=><tr key={s.id}><td><b>{s.name}</b><small className="cell-sub">{s.category}</small></td><td>{s.billing_cycle}</td><td>{money(s.amount)}</td><td><CalendarDays size={14} className="inline-icon"/> {s.next_renewal}</td><td><button className="icon-button danger" onClick={()=>deleteSub(s.id)}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div>}</section>}
      {page==='budgets' && <div className="content-grid"><section className="panel"><h3>Set a monthly budget</h3><p className="muted">Choose a category and spending limit.</p><form className="form-stack" onSubmit={addBudget}><label>Category<select value={budget.category} onChange={e=>setBudget({...budget,category:e.target.value})}>{categories.filter(c=>c!=='Salary').map(c=><option>{c}</option>)}</select></label><label>Monthly limit (₹)<input required type="number" min="1" value={budget.amount} onChange={e=>setBudget({...budget,amount:e.target.value})}/></label><label>Month<input type="month" value={budget.month} onChange={e=>setBudget({...budget,month:e.target.value})}/></label><button className="primary">Save budget</button></form></section><section className="panel"><h3>Budget limits</h3>{budgets.length===0?<Empty text="No budgets set for this month."/>:budgets.map(b=><div className="budget-row" key={b.id}><div className="between"><b>{b.category}</b><span>{money(b.spent)} / {money(b.amount)}</span></div><div className="progress"><span style={{width:`${Math.min(100,b.spent/b.amount*100)}%`}}/></div><small className="muted">{Math.max(0,100-b.spent/b.amount*100).toFixed(0)}% remaining</small></div>)}</section></div>}
      {page==='ai' && <section className="panel ai-panel"><div className="ai-hero"><div className="ai-icon"><Sparkles size={25}/></div><div><h3>Your personal money coach</h3><p className="muted">Get helpful suggestions based on your recorded transactions and subscriptions.</p></div></div><button className="primary" disabled={busy} onClick={getAI}><Sparkles size={17}/>{busy?'Analyzing…':'Generate my insights'}</button>{insights && <div className="insight-result"><div className="between"><b>Spending analysis</b><span className="source-tag">{aiSource}</span></div><div className="markdown-content">
  <ReactMarkdown remarkPlugins={[remarkGfm]}>
    {insights}
  </ReactMarkdown>
</div>
</div>}
</section>}
</main>
    {editingTxn && <Modal title="Edit transaction" close={()=>setEditingTxn(null)}>
  <form className="form-stack" onSubmit={updateTxn}>
    <label>Transaction title
      <input required value={editingTxn.title} onChange={e=>setEditingTxn({...editingTxn,title:e.target.value})}/>
    </label>

    <div className="two-col">
      <label>Type
        <select value={editingTxn.kind} onChange={e=>setEditingTxn({...editingTxn,kind:e.target.value})}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </label>

      <label>Amount (₹)
        <input required type="number" min="1" step="0.01" value={editingTxn.amount} onChange={e=>setEditingTxn({...editingTxn,amount:e.target.value})}/>
      </label>
    </div>

    <label>Category
      <select value={editingTxn.category} onChange={e=>setEditingTxn({...editingTxn,category:e.target.value})}>
        {categories.map(c=><option key={c}>{c}</option>)}
      </select>
    </label>

    <label>Date
      <input required type="date" value={editingTxn.date} onChange={e=>setEditingTxn({...editingTxn,date:e.target.value})}/>
    </label>

    <label>Note (optional)
      <input value={editingTxn.note || ''} onChange={e=>setEditingTxn({...editingTxn,note:e.target.value})}/>
    </label>

    <button className="primary full" disabled={busy}>Update transaction</button>
  </form>
</Modal>}
    {showTxn && <Modal title="Add transaction" close={()=>setShowTxn(false)}><form className="form-stack" onSubmit={addTxn}><label>Transaction title<input required value={txn.title} onChange={e=>setTxn({...txn,title:e.target.value})} placeholder="e.g. Grocery shopping"/></label><div className="two-col"><label>Type<select value={txn.kind} onChange={e=>setTxn({...txn,kind:e.target.value,category:e.target.value==='income'?'Salary':'Food'})}><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Amount (₹)<input required type="number" min="1" step="0.01" value={txn.amount} onChange={e=>setTxn({...txn,amount:e.target.value})}/></label></div><label>Category<select value={txn.category} onChange={e=>setTxn({...txn,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Date<input type="date" required value={txn.date} onChange={e=>setTxn({...txn,date:e.target.value})}/></label><label>Note (optional)<input value={txn.note} onChange={e=>setTxn({...txn,note:e.target.value})}/></label><button className="primary full" disabled={busy}>Save transaction</button></form></Modal>}
    {showSub && <Modal title="Add subscription" close={()=>setShowSub(false)}><form className="form-stack" onSubmit={addSub}><label>Service name<input required value={sub.name} onChange={e=>setSub({...sub,name:e.target.value})} placeholder="e.g. Netflix"/></label><label>Amount (₹)<input required type="number" min="1" step="0.01" value={sub.amount} onChange={e=>setSub({...sub,amount:e.target.value})}/></label><div className="two-col"><label>Billing cycle<select value={sub.billing_cycle} onChange={e=>setSub({...sub,billing_cycle:e.target.value})}><option>Monthly</option><option>Yearly</option><option>Weekly</option></select></label><label>Category<select value={sub.category} onChange={e=>setSub({...sub,category:e.target.value})}><option>Entertainment</option><option>Software</option><option>Education</option><option>Other</option></select></label></div><label>Next renewal date<input type="date" required value={sub.next_renewal} onChange={e=>setSub({...sub,next_renewal:e.target.value})}/></label><button className="primary full" disabled={busy}>Save subscription</button></form></Modal>}
  </div>
}
function Stat({title,value,icon:Icon,tone}) { return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={19}/></div><p>{title}</p><h3>{value}</h3></div> }
function Empty({text}) { return <div className="empty"><div className="empty-icon"><ReceiptText size={22}/></div><p>{text}</p></div> }
function TransactionList({rows,onDelete,onEdit,empty='No transactions recorded yet.'}) {
  return rows.length===0?<Empty text={empty}/>:<div className="transaction-list">
    {rows.map(t=><div className="transaction" key={t.id}>
      <div className={`txn-icon ${t.kind}`}><ReceiptText size={17}/></div>
      <div className="txn-info">
        <b>{t.title}</b>
        <small>{t.category} · {t.date}</small>
      </div>
      <strong className={t.kind==='income'?'positive':'negative'}>
        {t.kind==='income'?'+':'−'}{money(t.amount)}
      </strong>
      <button className="text-button" onClick={()=>onEdit(t)}>Edit</button>
      <button className="icon-button" onClick={()=>onDelete(t.id)} title="Delete">
        <Trash2 size={15}/>
      </button>
    </div>)}
  </div>
}
function Modal({title,close,children}) { return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className="modal"><div className="modal-head"><h3>{title}</h3><button className="icon-button" onClick={close}><X size={18}/></button></div>{children}</div></div> }
