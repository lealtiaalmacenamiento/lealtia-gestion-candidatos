interface RewardListProps {
  items: Array<{ id: string; title: string; description?: string; isAccumulative?: boolean }>
}

export default function RewardList({ items }: RewardListProps) {
  if (items.length === 0) {
    return <div className="text-muted small">Sin recompensas configuradas.</div>
  }
  return (
    <div className="list-group">
      {items.map((item, index) => (
        <div key={item.id ?? index} className="list-group-item">
          <div className="d-flex justify-content-between align-items-center">
            <h6 className="mb-1">{item.title}</h6>
            {item.isAccumulative && <span className="badge bg-info-subtle text-info">Acumulativa</span>}
          </div>
          {item.description && <p className="mb-0 small text-muted">{item.description}</p>}
        </div>
      ))}
    </div>
  )
}
