import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import FranchiseDetailClient from '@/components/admin/FranchiseDetailClient'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

export default async function FranchiseDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { tab = 'dashboard' } = await searchParams

  const supabase = createAdminClient()

  // Fetch franchise info
  const cleanId = id.trim()
  const { data: franchise, error } = await supabase
    .from('franchises')
    .select('id, name, owner_name, owner_email, region, status, created_at, auth_id')
    .eq('id', cleanId)
    .single()

  if (error || !franchise) {
    return (
      <div style={{ padding: '2rem', color: 'red' }}>
        <h2>DEBUG 404 DATA</h2>
        <p><strong>ID Param:</strong> {JSON.stringify(id)}</p>
        <p><strong>Error:</strong> {JSON.stringify(error)}</p>
        <p><strong>Franchise Data:</strong> {JSON.stringify(franchise)}</p>
      </div>
    )
  }

  // Fetch all branches
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name, location, active_device_id, status')
    .eq('franchise_id', id)
    .order('name')

  const branchIds = (branches || []).map(b => b.id)
  const safeBranchIds = branchIds.length > 0 ? branchIds : ['00000000-0000-0000-0000-000000000000']

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Parallel data fetch
  const [
    { data: todayTx },
    { data: weekTx },
    { data: salesTx },
    { data: recentTx },
    { data: staff },
    { data: topItems },
  ] = await Promise.all([
    // Today's revenue
    supabase.from('transactions')
      .select('total_amount, payment_method')
      .in('branch_id', safeBranchIds)
      .eq('status', 'completed')
      .gte('created_at', today.toISOString()),

    // Week revenue (chart)
    supabase.from('transactions')
      .select('total_amount, created_at')
      .in('branch_id', safeBranchIds)
      .eq('status', 'completed')
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: true }),

    // 90-day sales for the sales tab
    supabase.from('transactions')
      .select('total_amount, discount_amount, payment_method, status, created_at')
      .in('branch_id', safeBranchIds)
      .eq('status', 'completed')
      .gte('created_at', ninetyDaysAgo)
      .order('created_at', { ascending: true }),

    // Recent transactions
    supabase.from('transactions')
      .select('id, total_amount, status, payment_method, reference_number, bank_name, discount_type, discount_amount, created_at, void_reason, table_number, delivery_platform, users(name), branches(name), transaction_items(quantity, unit_price, subtotal, products(name, category))')
      .in('branch_id', safeBranchIds)
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(200),

    // Staff
    supabase.from('users')
      .select('id, name, email, role, pin_code, is_active, created_at')
      .in('branch_id', safeBranchIds)
      .order('role').order('name'),

    // Top items
    supabase.from('transaction_items')
      .select('quantity, subtotal, products(name, category), transactions!inner(branch_id, status, created_at)')
      .in('transactions.branch_id', safeBranchIds)
      .eq('transactions.status', 'completed')
      .gte('transactions.created_at', thirtyDaysAgo),
  ])

  // Stock: all globally available products + this franchise's branch overrides
  const [{ data: allProducts }, { data: stockOverrides }] = await Promise.all([
    supabase.from('products')
      .select('id, name, category, price, image_url')
      .eq('is_available', true)
      .order('category').order('name'),
    supabase.from('branch_menu_availability')
      .select('product_id, is_available, branch_id')
      .in('branch_id', safeBranchIds)
      .eq('is_available', false),
  ])

  // ── Inventory (read-only view for master admin) ────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0]
  const dateStart = `${todayStr}T00:00:00.000Z`
  const dateEnd   = `${todayStr}T23:59:59.999Z`

  const [
    { data: invCategories },
    { data: invItems },
    { data: invLogs },
    { data: menuItemLogs },
    { data: foodMenuLinks },
    { data: txItemsForInv },
  ] = await Promise.all([
    supabase.from('inventory_categories').select('id, name, sheet_type, sort_order').order('sheet_type').order('sort_order'),
    supabase.from('inventory_items').select('id, category_id, name, unit, min_stock_level, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('daily_inventory_logs')
      .select('id, inventory_item_id, starting_stock, additional_stock, used_stock, ending_stock, notes')
      .in('branch_id', safeBranchIds)
      .eq('log_date', todayStr),
    supabase.from('menu_item_daily_logs')
      .select('id, product_id, starting_stock, additional_stock, notes')
      .in('branch_id', safeBranchIds)
      .eq('log_date', todayStr),
    supabase.from('food_item_menu_links').select('inventory_item_id, product_id'),
    supabase.from('transaction_items')
      .select('product_id, quantity, cancelled, transactions!inner(branch_id, status, created_at)')
      .in('transactions.branch_id', safeBranchIds)
      .gte('transactions.created_at', dateStart)
      .lte('transactions.created_at', dateEnd),
  ])

  // Build sold/cancelled/voided maps for today
  const invSoldMap: Record<string, number> = {}
  const invCancelledMap: Record<string, number> = {}
  const invVoidedMap: Record<string, number> = {}
  for (const ti of txItemsForInv || []) {
    const pid = ti.product_id
    const tx = (ti as any).transactions
    const qty = Number(ti.quantity ?? 0)
    if (tx?.status === 'voided')  invVoidedMap[pid]    = (invVoidedMap[pid]    ?? 0) + qty
    else if (ti.cancelled)        invCancelledMap[pid] = (invCancelledMap[pid] ?? 0) + qty
    else                          invSoldMap[pid]      = (invSoldMap[pid]      ?? 0) + qty
  }

  const todayRevenue = (todayTx || []).reduce((s, t) => s + Number(t.total_amount), 0)
  const todayOrders  = (todayTx || []).length

  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const label   = d.toLocaleDateString('en-US', { weekday: 'short' })
    const dateStr = d.toISOString().split('T')[0]
    const revenue = (weekTx || [])
      .filter(t => t.created_at.startsWith(dateStr))
      .reduce((s, t) => s + Number(t.total_amount), 0)
    return { label, revenue, isToday: i === 6 }
  })

  const payBreakdown: Record<string, number> = {}
  for (const t of todayTx || []) {
    payBreakdown[t.payment_method] = (payBreakdown[t.payment_method] || 0) + Number(t.total_amount)
  }

  const itemMap: Record<string, { name: string; category: string; qty: number; revenue: number }> = {}
  for (const row of topItems || []) {
    const prod = row.products as unknown as { name: string; category: string } | null
    if (!prod) continue
    if (!itemMap[prod.name]) itemMap[prod.name] = { name: prod.name, category: prod.category, qty: 0, revenue: 0 }
    itemMap[prod.name].qty     += Number(row.quantity)
    itemMap[prod.name].revenue += Number(row.subtotal)
  }
  const topItemsList = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5)

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
        <Link href="/franchises" style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}>
          ← Franchises
        </Link>
        <span>/</span>
        <span style={{ color: 'var(--color-text)' }}>{franchise.name}</span>
      </div>

      <FranchiseDetailClient
        franchise={franchise}
        branches={(branches || []) as Parameters<typeof FranchiseDetailClient>[0]['branches']}
        activeTab={tab as Parameters<typeof FranchiseDetailClient>[0]['activeTab']}
        // Dashboard data
        todayRevenue={todayRevenue}
        todayOrders={todayOrders}
        chartData={chartData}
        payBreakdown={payBreakdown}
        topItemsList={topItemsList}
        // Sales data
        salesTransactions={(salesTx || []) as Parameters<typeof FranchiseDetailClient>[0]['salesTransactions']}
        // Transactions data
        transactions={(recentTx || []) as unknown as Parameters<typeof FranchiseDetailClient>[0]['transactions']}
        // Staff data
        staff={(staff || []) as Parameters<typeof FranchiseDetailClient>[0]['staff']}
        // Stock data (read-only view of franchisee's menu overrides)
        allProducts={(allProducts || []) as Parameters<typeof FranchiseDetailClient>[0]['allProducts']}
        stockOverrides={(stockOverrides || []) as Parameters<typeof FranchiseDetailClient>[0]['stockOverrides']}
        // Inventory data (read-only)
        invCategories={(invCategories || []) as Parameters<typeof FranchiseDetailClient>[0]['invCategories']}
        invItems={(invItems || []) as Parameters<typeof FranchiseDetailClient>[0]['invItems']}
        invLogs={(invLogs || []) as Parameters<typeof FranchiseDetailClient>[0]['invLogs']}
        menuItemLogs={(menuItemLogs || []) as Parameters<typeof FranchiseDetailClient>[0]['menuItemLogs']}
        foodMenuLinks={(foodMenuLinks || []) as Parameters<typeof FranchiseDetailClient>[0]['foodMenuLinks']}
        invSoldMap={invSoldMap}
        invCancelledMap={invCancelledMap}
        invVoidedMap={invVoidedMap}
        invProducts={(allProducts || []) as Parameters<typeof FranchiseDetailClient>[0]['invProducts']}
      />
    </div>
  )
}
