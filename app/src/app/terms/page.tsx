import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal")
  return { title: t("terms.metaTitle") }
}

export default async function TermsPage() {
  const t = await getTranslations("legal")
  const tc = await getTranslations("common")

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 h-16 flex items-center gap-3">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5">
            <ArrowLeft className="size-4" />
            {tc("back")}
          </Link>
          <span className="text-lg font-bold text-primary ml-auto">ServiçoOS</span>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">{t("terms.title")}</h1>
          <p className="text-sm text-muted-foreground mt-2">{t("terms.lastUpdated")}</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground [&_h2]:text-foreground [&_h2]:font-semibold [&_h2]:text-lg [&_h2]:mb-3 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_p+p]:mt-3">
          <section>
            <h2>{t("terms.section1.title")}</h2>
            <p>
              {t.rich("terms.section1.p1", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <p>
              {t.rich("terms.section1.p2", {
                privacyLink: (chunks) => (
                  <Link href="/privacy" className="text-primary underline underline-offset-2">{chunks}</Link>
                ),
              })}
            </p>
          </section>

          <section>
            <h2>{t("terms.section2.title")}</h2>
            <p>{t("terms.section2.p1")}</p>
            <p>{t("terms.section2.p2")}</p>
          </section>

          <section>
            <h2>{t("terms.section3.title")}</h2>
            <p>{t("terms.section3.p1")}</p>
            <p>
              {t("terms.section3.p2", {
                owner: tc("roles.OWNER").toLowerCase(),
                admin: tc("roles.ADMIN").toLowerCase(),
                technician: tc("roles.TECHNICIAN").toLowerCase(),
              })}
            </p>
          </section>

          <section>
            <h2>{t("terms.section4.title")}</h2>
            <p>
              {t.rich("terms.section4.p1", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <p>{t("terms.section4.p2")}</p>
          </section>

          <section>
            <h2>{t("terms.section5.title")}</h2>
            <p>
              {t.rich("terms.section5.p1", {
                planosLink: (chunks) => (
                  <Link href="/#planos" className="text-primary underline underline-offset-2">{chunks}</Link>
                ),
              })}
            </p>
            <p>{t("terms.section5.p2")}</p>
            <p>{t("terms.section5.p3")}</p>
          </section>

          <section>
            <h2>{t("terms.section6.title")}</h2>
            <p>{t("terms.section6.p1")}</p>
            <p>{t("terms.section6.p2")}</p>
          </section>

          <section>
            <h2>{t("terms.section7.title")}</h2>
            <p>{t("terms.section7.p1")}</p>
          </section>

          <section>
            <h2>{t("terms.section8.title")}</h2>
            <p>
              {t.rich("terms.section8.p1", {
                privacyLink: (chunks) => (
                  <Link href="/privacy" className="text-primary underline underline-offset-2">{chunks}</Link>
                ),
              })}
            </p>
            <p>{t("terms.section8.p2")}</p>
            {/* Transparência sobre o acesso de suporte. Existe porque o painel
                do dono permite entrar na conta do cliente pra dar suporte —
                fazer isso sem avisar em contrato é problema de LGPD, não só de
                cortesia. (Adicionado em 10/08/2026.) */}
            <p>
              {t.rich("terms.section8.p3", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <ul>
              <li>{t("terms.section8.i1")}</li>
              <li>{t("terms.section8.i2")}</li>
              <li>{t("terms.section8.i3")}</li>
              <li>{t("terms.section8.i4")}</li>
              <li>{t("terms.section8.i5")}</li>
            </ul>
            <p>{t("terms.section8.p4")}</p>
          </section>

          <section>
            <h2>{t("terms.section9.title")}</h2>
            <p>{t("terms.section9.intro")}</p>
            <ul>
              <li>{t("terms.section9.item1")}</li>
              <li>{t("terms.section9.item2")}</li>
              <li>{t("terms.section9.item3")}</li>
              <li>{t("terms.section9.item4")}</li>
              <li>{t("terms.section9.item5")}</li>
            </ul>
          </section>

          <section>
            <h2>{t("terms.section10.title")}</h2>
            <p>{t("terms.section10.p1")}</p>
          </section>

          <section>
            <h2>{t("terms.section11.title")}</h2>
            <p>{t("terms.section11.p1")}</p>
          </section>

          <section>
            <h2>{t("terms.section12.title")}</h2>
            <p>{t("terms.section12.p1")}</p>
            <p>{t("terms.section12.p2")}</p>
          </section>

          <section>
            <h2>{t("terms.section13.title")}</h2>
            <p>{t("terms.section13.p1")}</p>
          </section>

          <section>
            <h2>{t("terms.section14.title")}</h2>
            <p>{t("terms.section14.p1")}</p>
          </section>

          <section>
            <h2>{t("terms.section15.title")}</h2>
            <p>{t("terms.section15.p1")}</p>
          </section>

          <section>
            <h2>{t("terms.section16.title")}</h2>
            <p>
              {t.rich("terms.section16.p1", {
                email: (chunks) => (
                  <a href="mailto:olisuporte1@gmail.com" className="text-primary underline underline-offset-2">
                    {chunks}
                  </a>
                ),
              })}
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
