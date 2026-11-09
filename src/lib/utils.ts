import clsx, { type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid(prefix = ''): string {
  const id = crypto.randomUUID()
  return prefix ? `${prefix}_${id}` : id
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function todayInputDate(): string {
  return new Date().toISOString().slice(0, 10)
}
