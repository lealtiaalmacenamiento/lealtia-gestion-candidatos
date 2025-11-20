declare module 'pg' {
  export class Client {
    constructor(config?: { connectionString?: string } | string)
    connect(): Promise<void>
    end(): Promise<void>
    query<T = unknown>(queryText: string, values?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>
  }
}
