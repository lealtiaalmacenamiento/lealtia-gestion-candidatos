import type { Segment } from '@/types'

interface SegmentSelectorProps {
  segments: Segment[]
  value?: string | null
  onChange: (segmentId: string | null) => void
  placeholder?: string
  allowEmpty?: boolean
  id?: string
  disabled?: boolean
}

export default function SegmentSelector({
  segments,
  value,
  onChange,
  placeholder = 'Selecciona un segmento',
  allowEmpty = true,
  id = 'segment-selector',
  disabled = false
}: SegmentSelectorProps) {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = event.target.value
    if (!selected) {
      onChange(null)
      return
    }
    onChange(selected)
  }

  return (
    <select
      id={id}
      className="form-select form-select-sm"
      value={value ?? ''}
      onChange={handleChange}
      disabled={disabled}
    >
      {allowEmpty && <option value="">{placeholder}</option>}
      {segments.map(segment => (
        <option key={segment.id} value={segment.id}>
          {segment.name}
        </option>
      ))}
    </select>
  )
}
