'use client'

interface Announcement {
  id: string
  title: string
  body: string
  priority: string
  created_at: string
  is_active: boolean
}

export default function FranchiserAnnouncementsClient({ announcements }: { announcements: Announcement[] }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Announcements</h1>
          <p className="page-header-subtitle">Updates and notices from headquarters</p>
        </div>
      </div>
      <div className="table-wrapper">
        <div className="table-header">
          <p className="table-title">Recent Announcements</p>
        </div>
        {announcements.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            No announcements at this time.
          </div>
        ) : (
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {announcements.map((announcement) => (
              <div key={announcement.id} style={{ padding: '1.5rem', border: '1px solid var(--color-border)', borderRadius: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{announcement.title}</h3>
                  <span className={`badge badge-${announcement.priority === 'high' ? 'danger' : 'info'}`}>
                    {announcement.priority.toUpperCase()}
                  </span>
                </div>
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  {new Date(announcement.created_at).toLocaleDateString()}
                </p>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{announcement.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
