'use client'

interface Props {
  branchName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transactions: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  topItems?: any[]
}

export default function FranchiserSalesClient({ branchName, transactions }: Props) {
  const totalSales = transactions.reduce((sum, tx) => sum + Number(tx.total_amount), 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Sales Dashboard</h1>
          <p className="page-header-subtitle">Last 30 days performance for {branchName}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <div className="table-wrapper" style={{ padding: '1.5rem', flex: 1 }}>
          <h3 style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Total Revenue (30d)</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0 0' }}>
            ₱{totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="table-wrapper" style={{ padding: '1.5rem', flex: 1 }}>
          <h3 style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Total Transactions (30d)</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0 0' }}>
            {transactions.length}
          </p>
        </div>
      </div>

      <div className="table-wrapper">
        <div className="table-header">
          <p className="table-title">Recent Transactions</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Method</th>
            </tr>
          </thead>
          <tbody>
            {transactions.slice(0, 10).map((tx, idx) => (
              <tr key={idx}>
                <td>{new Date(tx.created_at).toLocaleString()}</td>
                <td>₱{Number(tx.total_amount).toFixed(2)}</td>
                <td><span className="badge badge-info">{tx.payment_method}</span></td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', padding: '2rem' }}>No recent transactions</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
