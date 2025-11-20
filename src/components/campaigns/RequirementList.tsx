interface RequirementListProps {
  items: Array<{ id: string; label: string; met?: boolean; description?: string }>
}

export default function RequirementList({ items }: RequirementListProps) {
  if (items.length === 0) {
    return <div className="text-muted small">Sin requisitos configurados.</div>
  }
  return (
    <ul className="list-group list-group-flush">
      {items.map(item => (
        <li key={item.id} className="list-group-item d-flex align-items-start gap-2">
          <i className={`bi ${item.met ? 'bi-check-circle-fill text-success' : 'bi-dash-circle text-muted'} mt-1`}></i>
          <div>
            <div className="fw-semibold small">{item.label}</div>
            {item.description && <div className="text-muted small">{item.description}</div>}
          </div>
        </li>
      ))}
    </ul>
  )
}
