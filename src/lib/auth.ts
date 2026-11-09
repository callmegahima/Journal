import type { LockConfig } from '@/types'

const ITERATIONS = 210_000
const KEY_BITS = 256

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function derive(passcode: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passcode),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_BITS,
  )
  return new Uint8Array(bits)
}

export async function createPasscode(passcode: string): Promise<LockConfig> {
  if (!crypto.subtle) {
    throw new Error(
      'Secure passcode hashing requires a secure context (localhost or HTTPS).',
    )
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(passcode, salt, ITERATIONS)
  return {
    enabled: true,
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hash),
    iterations: ITERATIONS,
  }
}

export async function verifyPasscode(passcode: string, lock: LockConfig): Promise<boolean> {
  if (!lock.enabled || !lock.salt || !lock.hash) return false
  if (!crypto.subtle) return false
  try {
    const salt = base64ToBytes(lock.salt)
    const candidate = await derive(passcode, salt, lock.iterations ?? ITERATIONS)
    const expected = base64ToBytes(lock.hash)
    if (candidate.length !== expected.length) return false
    let difference = 0
    for (let i = 0; i < candidate.length; i += 1) {
      difference |= candidate[i] ^ expected[i]
    }
    return difference === 0
  } catch {
    return false
  }
}

export function passcodeStrength(passcode: string): { score: number; label: string } {
  let score = 0
  if (passcode.length >= 6) score += 1
  if (passcode.length >= 10) score += 1
  if (/[a-z]/.test(passcode) && /[A-Z]/.test(passcode)) score += 1
  if (/\d/.test(passcode)) score += 1
  if (/[^A-Za-z0-9]/.test(passcode)) score += 1
  const label = score <= 1 ? 'Weak' : score <= 3 ? 'Fair' : 'Strong'
  return { score, label }
}
