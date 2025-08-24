declare module 'nodemailer' {
  interface TransporterSendMailOptions { from?: string; to: string; subject: string; text?: string; html?: string }
  interface Transporter { sendMail(opts: TransporterSendMailOptions): Promise<unknown> }
  interface NodemailerModule { createTransport(opts: unknown): Transporter }
  const nodemailer: NodemailerModule
  export function createTransport(opts: unknown): Transporter
  export default nodemailer
}