declare module 'nodemailer' {
  interface AttachmentLike { filename: string; content: Buffer | string; contentType?: string }
  interface TransporterSendMailOptions { from?: string; to: string | string[]; subject: string; text?: string; html?: string; attachments?: AttachmentLike[] }
  interface Transporter { sendMail(opts: TransporterSendMailOptions): Promise<unknown> }
  interface NodemailerModule { createTransport(opts: unknown): Transporter }
  const nodemailer: NodemailerModule
  export function createTransport(opts: unknown): Transporter
  export default nodemailer
}