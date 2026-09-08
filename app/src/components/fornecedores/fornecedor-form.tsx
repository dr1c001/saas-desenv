"use client"

import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { salvarFornecedor, type EstadoFornecedor } from "@/actions/fornecedores"

// A ficha do fornecedor.
//
// ─── Por que TUDO é opcional menos o nome ────────────────────────────────────
//
// Já existem fornecedores gravados só com o nome. Campo obrigatório travaria a
// EDIÇÃO deles: a pessoa abriria a ficha para corrigir um telefone errado e o
// formulário exigiria CEP, razão social e condição de pagamento antes de deixar
// salvar. Cadastro pobre é melhor que cadastro impossível de corrigir.
//
// Os campos ficam em blocos porque ninguém preenche uma ficha de vinte campos
// de uma vez: preenche o nome e o telefone hoje, o banco quando for pagar.

export type FornecedorDoForm = {
  id: string
  name: string
  legalName: string | null
  document: string | null
  stateRegistration: string | null
  cityRegistration: string | null
  category: string | null
  email: string | null
  phone: string | null
  contactName: string | null
  contactPhone: string | null
  website: string | null
  zipCode: string | null
  street: string | null
  number: string | null
  complement: string | null
  district: string | null
  city: string | null
  state: string | null
  paymentTerms: string | null
  leadTimeDays: number | null
  pixKey: string | null
  bankName: string | null
  bankAgency: string | null
  bankAccount: string | null
  notes: string | null
}

export function FornecedorForm({ fornecedor }: { fornecedor?: FornecedorDoForm }) {
  const t = useTranslations("fornecedores")
  const router = useRouter()
  const [estado, formAction, salvando] = useActionState<EstadoFornecedor, FormData>(
    salvarFornecedor.bind(null, fornecedor?.id ?? null),
    {}
  )

  if (estado.ok) setTimeout(() => router.push("/fornecedores"), 0)

  const v = (campo: keyof FornecedorDoForm) => {
    const valor = fornecedor?.[campo]
    return valor === null || valor === undefined ? "" : String(valor)
  }

  return (
    <form action={formAction} className="space-y-4">
      <Bloco titulo={t("blocos.identificacao")}>
        <Campo id="name" rotulo={t("campos.nome")} obrigatorio className="sm:col-span-2">
          <Input id="name" name="name" required maxLength={120} defaultValue={v("name")} />
          <Ajuda>{t("campos.nomeAjuda")}</Ajuda>
        </Campo>
        <Campo id="legalName" rotulo={t("campos.razaoSocial")} className="sm:col-span-2">
          <Input id="legalName" name="legalName" maxLength={160} defaultValue={v("legalName")} />
        </Campo>
        <Campo id="document" rotulo={t("campos.documento")}>
          <Input
            id="document"
            name="document"
            maxLength={20}
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            defaultValue={v("document")}
          />
          <Ajuda>{t("campos.documentoAjuda")}</Ajuda>
        </Campo>
        <Campo id="category" rotulo={t("campos.ramo")}>
          <Input
            id="category"
            name="category"
            maxLength={60}
            placeholder={t("campos.ramoExemplo")}
            defaultValue={v("category")}
          />
        </Campo>
        <Campo id="stateRegistration" rotulo={t("campos.inscricaoEstadual")}>
          <Input
            id="stateRegistration"
            name="stateRegistration"
            maxLength={30}
            defaultValue={v("stateRegistration")}
          />
        </Campo>
        <Campo id="cityRegistration" rotulo={t("campos.inscricaoMunicipal")}>
          <Input
            id="cityRegistration"
            name="cityRegistration"
            maxLength={30}
            defaultValue={v("cityRegistration")}
          />
        </Campo>
      </Bloco>

      <Bloco titulo={t("blocos.contato")}>
        <Campo id="phone" rotulo={t("campos.telefone")}>
          <Input id="phone" name="phone" maxLength={30} defaultValue={v("phone")} />
        </Campo>
        <Campo id="email" rotulo={t("campos.email")}>
          <Input id="email" name="email" type="email" maxLength={160} defaultValue={v("email")} />
        </Campo>
        <Campo id="contactName" rotulo={t("campos.contato")}>
          <Input id="contactName" name="contactName" maxLength={120} defaultValue={v("contactName")} />
          <Ajuda>{t("campos.contatoAjuda")}</Ajuda>
        </Campo>
        <Campo id="contactPhone" rotulo={t("campos.contatoTelefone")}>
          <Input
            id="contactPhone"
            name="contactPhone"
            maxLength={30}
            defaultValue={v("contactPhone")}
          />
        </Campo>
        <Campo id="website" rotulo={t("campos.site")} className="sm:col-span-2">
          <Input id="website" name="website" maxLength={200} defaultValue={v("website")} />
        </Campo>
      </Bloco>

      <Bloco titulo={t("blocos.endereco")}>
        <Campo id="zipCode" rotulo={t("campos.cep")}>
          <Input id="zipCode" name="zipCode" maxLength={12} inputMode="numeric" defaultValue={v("zipCode")} />
        </Campo>
        <Campo id="street" rotulo={t("campos.rua")}>
          <Input id="street" name="street" maxLength={160} defaultValue={v("street")} />
        </Campo>
        <Campo id="number" rotulo={t("campos.numero")}>
          <Input id="number" name="number" maxLength={20} defaultValue={v("number")} />
        </Campo>
        <Campo id="complement" rotulo={t("campos.complemento")}>
          <Input id="complement" name="complement" maxLength={80} defaultValue={v("complement")} />
        </Campo>
        <Campo id="district" rotulo={t("campos.bairro")}>
          <Input id="district" name="district" maxLength={80} defaultValue={v("district")} />
        </Campo>
        <Campo id="city" rotulo={t("campos.cidade")}>
          <Input id="city" name="city" maxLength={80} defaultValue={v("city")} />
        </Campo>
        <Campo id="state" rotulo={t("campos.uf")}>
          <Input id="state" name="state" maxLength={2} className="w-20" defaultValue={v("state")} />
        </Campo>
      </Bloco>

      <Bloco titulo={t("blocos.comercial")}>
        <Campo id="paymentTerms" rotulo={t("campos.pagamento")}>
          <Input
            id="paymentTerms"
            name="paymentTerms"
            maxLength={80}
            placeholder={t("campos.pagamentoExemplo")}
            defaultValue={v("paymentTerms")}
          />
        </Campo>
        <Campo id="leadTimeDays" rotulo={t("campos.prazo")}>
          <Input
            id="leadTimeDays"
            name="leadTimeDays"
            type="number"
            min={0}
            max={999}
            className="w-28"
            defaultValue={v("leadTimeDays")}
          />
          <Ajuda>{t("campos.prazoAjuda")}</Ajuda>
        </Campo>
        <Campo id="pixKey" rotulo={t("campos.pix")} className="sm:col-span-2">
          <Input id="pixKey" name="pixKey" maxLength={140} defaultValue={v("pixKey")} />
        </Campo>
        <Campo id="bankName" rotulo={t("campos.banco")}>
          <Input id="bankName" name="bankName" maxLength={80} defaultValue={v("bankName")} />
        </Campo>
        <Campo id="bankAgency" rotulo={t("campos.agencia")}>
          <Input id="bankAgency" name="bankAgency" maxLength={20} defaultValue={v("bankAgency")} />
        </Campo>
        <Campo id="bankAccount" rotulo={t("campos.conta")}>
          <Input id="bankAccount" name="bankAccount" maxLength={30} defaultValue={v("bankAccount")} />
        </Campo>
      </Bloco>

      <Bloco titulo={t("blocos.observacoes")}>
        <div className="sm:col-span-2">
          <Textarea name="notes" rows={3} maxLength={2000} defaultValue={v("notes")} />
          <Ajuda>{t("campos.observacoesAjuda")}</Ajuda>
        </div>
      </Bloco>

      {estado.erro && (
        <p className="text-sm text-destructive">{t(`erros.${estado.erro}` as "erros.semPermissao")}</p>
      )}

      {/* O aviso de duplicata NÃO impede salvar: há motivo legítimo (matriz e
          filial), e travar deixaria a pessoa sem saída no meio do cadastro. */}
      {estado.aviso && (
        <p className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t(`avisos.${estado.aviso}` as "avisos.documentoRepetido")}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={salvando}>
          {salvando && <Loader2 className="size-4 mr-2 animate-spin" />}
          {t("salvar")}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/fornecedores")}>
          {t("cancelar")}
        </Button>
      </div>
    </form>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {titulo}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">{children}</div>
      </CardContent>
    </Card>
  )
}

function Campo({
  id,
  rotulo,
  obrigatorio,
  className,
  children,
}: {
  id: string
  rotulo: string
  obrigatorio?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>
        {rotulo}
        {obrigatorio && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  )
}

function Ajuda({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>
}
