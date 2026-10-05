import type { KeyboardEvent, ClipboardEvent } from 'react'

const ALLOWED_KEYS = new Set([
  'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Home', 'End',
])

/** Bloquea teclas no numéricas en campos de entrada numérica */
export function onlyNumbersKeyDown(e: KeyboardEvent<HTMLInputElement>) {
  if (ALLOWED_KEYS.has(e.key)) return
  if (e.ctrlKey || e.metaKey) return   // permitir Ctrl+A, Ctrl+C, Ctrl+V, etc.
  if (!/^\d$/.test(e.key)) e.preventDefault()
}

/** Bloquea pegado de texto que no sea puramente numérico */
export function onlyNumbersPaste(e: ClipboardEvent<HTMLInputElement>) {
  const text = e.clipboardData.getData('text')
  if (!/^\d+$/.test(text)) e.preventDefault()
}
