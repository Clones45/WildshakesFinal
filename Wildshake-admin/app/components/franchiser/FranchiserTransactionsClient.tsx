'use client'

interface Props {
  branchName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transactions: any[]
}

export default function FranchiserTransactionsClient({ branchName, transactions }: Props) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Transaction History</h1>
          <p className="page-header-subtitle">Recent transactions for {branchName}</p>
        </div>
      </div>

      <div className="table-wrapper">
        <div className="table-header">
          <p className="table-title">All Transactions</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Ref #</th>
              <th>Date</th>
              <th>Total</th>
              <th>Status</th>
              <th>Method</th>
              <th>Cashier</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id}>
                <td style={{ fontFamily: 'monospace' }}>{tx.local_ref || tx.reference_number || tx.id.slice(0, 8)}</td>
                <td>{new Date(tx.created_at).toLocaleString()}</td>
                <td>₱{Number(tx.total_amount).toFixed(2)}</td>
                <td>
                  <span className={`badge ${tx.status === 'completed' ? 'badge-success' : tx.status === 'voided' ? 'badge-danger' : 'badge-warning'}`}>
                    {tx.status}
                  </span>
                </td>
                <td>{tx.payment_method}</td>
                <td>{tx.users?.name || 'Unknown'}</td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No transactions found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
