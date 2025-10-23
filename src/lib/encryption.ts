import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12

function getKey(): Buffer {
  const secret = process.env.AGENDA_ENCRYPTION_SECRET || process.env.ENCRYPTION_SECRET
  if (!secret || secret.length === 0) {
    throw new Error('[encryption] Falta configurar la variable AGENDA_ENCRYPTION_SECRET')
  }
  // Derivar a 32 bytes usando SHA-256 para mantener longitud fija
  return crypto.createHash('sha256').update(secret).digest().subarray(0, KEY_LENGTH)
}

export interface EncryptedPayload {
  cipher: string
  iv: string
  tag: string
}

export function encrypt(text: string): EncryptedPayload {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    cipher: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64')
  }
}

export function decrypt(payload: EncryptedPayload): string {
  const key = getKey()
  const iv = Buffer.from(payload.iv, 'base64')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.cipher, 'base64')),
    decipher.final()
  ])
  return decrypted.toString('utf8')
}
