export default function Notification({ message, type = 'success' }: { message: string, type?: 'success'|'error' }) {
  return (
    <div className={`notification ${type}`}>
      {message}
    </div>
  )
}
