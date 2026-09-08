import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal")
  return { title: t("privacy.metaTitle") }
}

export default async function PrivacyPage() {
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
          <h1 className="text-3xl font-bold">{t("privacy.title")}</h1>
          <p className="text-sm text-muted-foreground mt-2">{t("privacy.lastUpdated")}</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground [&_h2]:text-foreground [&_h2]:font-semibold [&_h2]:text-lg [&_h2]:mb-3 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_p+p]:mt-3 [&_table]:w-full [&_table]:text-xs [&_th]:text-left [&_th]:font-medium [&_th]:text-foreground [&_th]:py-2 [&_td]:py-2 [&_tr]:border-b">
          <section>
            <p>{t("privacy.intro")}</p>
          </section>

          <section>
            <h2>{t("privacy.section1.title")}</h2>
            <p>
              {t.rich("privacy.section1.p1", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
          </section>

          <section>
            <h2>{t("privacy.section2.title")}</h2>
            <p><strong>{t("privacy.section2.userDataLabel")}</strong></p>
            <ul>
              <li>{t("privacy.section2.userDataItem1")}</li>
              <li>{t("privacy.section2.userDataItem2")}</li>
              <li>{t("privacy.section2.userDataItem3")}</li>
            </ul>
            <p><strong>{t("privacy.section2.systemDataLabel")}</strong></p>
            <ul>
              <li>{t("privacy.section2.systemDataItem1")}</li>
              <li>{t("privacy.section2.systemDataItem2")}</li>
              <li>{t("privacy.section2.systemDataItem3")}</li>
              <li>{t("privacy.section2.systemDataItem4")}</li>
              <li>{t("privacy.section2.systemDataItem5")}</li>
            </ul>
            <p><strong>{t("privacy.section2.autoDataLabel")}</strong></p>
            <ul>
              <li>{t("privacy.section2.autoDataItem1")}</li>
              <li>{t("privacy.section2.autoDataItem2")}</li>
            </ul>
          </section>

          <section>
            <h2>{t("privacy.section3.title")}</h2>
            <p>{t("privacy.section3.intro")}</p>
            <ul>
              <li>{t("privacy.section3.item1")}</li>
              <li>{t("privacy.section3.item2")}</li>
              <li>{t("privacy.section3.item3")}</li>
              <li>{t("privacy.section3.item4")}</li>
              <li>
                {t("privacy.section3.item5", {
                  owner: tc("roles.OWNER").toLowerCase(),
                  admin: tc("roles.ADMIN").toLowerCase(),
                })}
              </li>
              <li>{t("privacy.section3.item6")}</li>
              <li>{t("privacy.section3.item7")}</li>
            </ul>
          </section>

          <section>
            <h2>{t("privacy.section4.title")}</h2>
            <p>{t("privacy.section4.p1")}</p>
            <table>
              <thead>
                <tr><th>{t("privacy.section4.table.serviceHeader")}</th><th>{t("privacy.section4.table.purposeHeader")}</th></tr>
              </thead>
              <tbody>
                <tr><td>Supabase</td><td>{t("privacy.section4.table.supabase")}</td></tr>
                <tr><td>Vercel</td><td>{t("privacy.section4.table.vercel")}</td></tr>
                <tr><td>Asaas</td><td>{t("privacy.section4.table.asaas")}</td></tr>
                <tr><td>nfe.io</td><td>{t("privacy.section4.table.nfeio")}</td></tr>
                <tr><td>Resend</td><td>{t("privacy.section4.table.resend")}</td></tr>
                <tr><td>Z-API</td><td>{t("privacy.section4.table.zapi")}</td></tr>
              </tbody>
            </table>
            <p>{t("privacy.section4.p2")}</p>
          </section>

          <section>
            <h2>{t("privacy.section5.title")}</h2>
            <p>{t("privacy.section5.p1")}</p>
          </section>

          <section>
            <h2>{t("privacy.section6.title")}</h2>
            <p>{t("privacy.section6.p1")}</p>
          </section>

          <section>
            <h2>{t("privacy.section7.title")}</h2>
            <p>{t("privacy.section7.intro")}</p>
            <ul>
              <li>{t("privacy.section7.item1")}</li>
              <li>{t("privacy.section7.item2")}</li>
              <li>{t("privacy.section7.item3")}</li>
              <li>{t("privacy.section7.item4")}</li>
              <li>{t("privacy.section7.item5")}</li>
              <li>{t("privacy.section7.item6")}</li>
              <li>{t("privacy.section7.item7")}</li>
              <li>{t("privacy.section7.item8")}</li>
            </ul>
          </section>

          <section>
            <h2>{t("privacy.section8.title")}</h2>
            <p>
              {t.rich("privacy.section8.p1", {
                email: (chunks) => (
                  <a href="mailto:olisuporte1@gmail.com" className="text-primary underline underline-offset-2">
                    {chunks}
                  </a>
                ),
              })}
            </p>
          </section>

          <section>
            <h2>{t("privacy.section9.title")}</h2>
            <p>{t("privacy.section9.p1")}</p>
          </section>

          <section>
            <h2>{t("privacy.section10.title")}</h2>
            <p>{t("privacy.section10.p1")}</p>
          </section>

          <section>
            <h2>{t("privacy.section11.title")}</h2>
            <p>{t("privacy.section11.p1")}</p>
          </section>

          <section>
            <h2>{t("privacy.section12.title")}</h2>
            <p>{t("privacy.section12.p1")}</p>
          </section>

          <section>
            <h2>{t("privacy.section13.title")}</h2>
            <p>
              {t.rich("privacy.section13.p1", {
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
