import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR")
}

export function formatOsNumber(number: number, createdAt: Date | string): string {
  const year = new Date(createdAt).getFullYear()
  return `OS${year}${String(number).padStart(4, "0")}`
}

export function formatOmNumber(number: number, createdAt: Date | string): string {
  const year = new Date(createdAt).getFullYear()
  return `OM${year}${String(number).padStart(4, "0")}`
}
