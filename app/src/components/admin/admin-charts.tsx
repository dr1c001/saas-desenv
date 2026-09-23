"use client"

import { useTranslations } from "next-intl"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export type PontoCrescimento = {
  mes: string
  empresas: number
  pagantes: number
  mrr: number
}

export type PontoUsuarios = {
  mes: string
  usuarios: number
  pagantes: number
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

export function GraficoCrescimento({ dados }: { dados: PontoCrescimento[] }) {
  const t = useTranslations("mapAdmin.admin.charts")
  return (
    <ResponsiveContainer width="100%" height={260}>
      {/* Barra = total de empresas cadastradas; linha = quantas pagam. A
          distância entre as duas é a taxa de conversão, e ela crescer quer
          dizer que gente entra mas não assina. */}
      <ComposedChart data={dados} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="empresas" name={t("companies")} fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
        <Line
          type="monotone"
          dataKey="pagantes"
          name={t("payingCompanies")}
          stroke="hsl(142 71% 45%)"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function GraficoMrr({ dados }: { dados: PontoCrescimento[] }) {
  const t = useTranslations("mapAdmin.admin.charts")
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={dados} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={brl} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={72} />
        <Tooltip formatter={(v) => brl(Number(v ?? 0))} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Bar dataKey="mrr" name={t("mrr")} fill="hsl(262 83% 58%)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function GraficoUsuarios({ dados }: { dados: PontoUsuarios[] }) {
  const t = useTranslations("mapAdmin.admin.charts")
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={dados} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="usuarios" name={t("users")} fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
        <Line
          type="monotone"
          dataKey="pagantes"
          name={t("payingUsers")}
          stroke="hsl(262 83% 58%)"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
