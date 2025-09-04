export default function EnvInfoPage() {
  return (
    <div style={{padding:'2rem',fontFamily:'system-ui,Arial'}}>
      <h1>Environment Info</h1>
      <ul>
        <li><strong>VERCEL_ENV:</strong> {process.env.VERCEL_ENV || 'undefined'}</li>
        <li><strong>VERCEL_URL:</strong> {process.env.VERCEL_URL || 'undefined'}</li>
        <li><strong>Commit ref:</strong> {process.env.VERCEL_GIT_COMMIT_REF || 'undefined'}</li>
        <li><strong>Commit sha:</strong> {process.env.VERCEL_GIT_COMMIT_SHA || 'undefined'}</li>
      </ul>
      <p>Si ves VERCEL_ENV=production aquí, el dominio que visitas está apuntando al deployment marcado como Production.</p>
    </div>
  )
}
