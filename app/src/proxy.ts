import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  // Propagate the pathname to Server Components (layouts don't receive it directly)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-pathname", request.nextUrl.pathname)

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getSession reads from cookie without network call — safe for Edge runtime
  const { data: { session } } = await supabase.auth.getSession()

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/register") ||
    request.nextUrl.pathname.startsWith("/forgot-password")

  const isPublicRoute =
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname.startsWith("/p/") ||
    request.nextUrl.pathname.startsWith("/q/") ||
    request.nextUrl.pathname.startsWith("/api/") ||
    request.nextUrl.pathname === "/terms" ||
    request.nextUrl.pathname === "/privacy" ||
    // Status precisa responder pra quem NAO esta logado — e justamente quando
    // algo esta quebrado que a pessoa vem olhar, e mandar pro login seria a
    // resposta mais frustrante possivel.
    request.nextUrl.pathname === "/status" ||
    // /offline é o destino de último recurso do service worker. Precisa ser
    // pública: se respondesse com redirect pro /login, o service worker
    // guardaria ESSE redirect no lugar da página, e o técnico sem sinal cairia
    // numa tela de login que não tem como funcionar offline.
    request.nextUrl.pathname === "/offline" ||
    // /reset-password must work whether or not a (recovery) session already exists —
    // it should never bounce to /login nor to /dashboard.
    request.nextUrl.pathname.startsWith("/reset-password")

  if (!session && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (session && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  // A lista antes era nominal (só favicon.ico), e todo arquivo estático novo
  // que alguém colocasse em public/ caía no redirect pra /login. Aconteceu com
  // quatro de uma vez, todos em silêncio:
  //   - /sw.js       -> o navegador recebia o HTML do login em vez de JS, o
  //                     registro do service worker falhava e as notificações
  //                     push NUNCA funcionaram em produção;
  //   - /manifest.json -> sem manifest, não dá pra instalar como app;
  //   - /robots.txt e /sitemap.xml -> o Google nunca conseguiu ler nenhum dos
  //                     dois desde que foram criados.
  // (Achado respondendo "dá pra virar aplicativo?", 10/08/2026.)
  //
  // Agora exclui qualquer caminho com extensão de arquivo, então o próximo
  // asset já nasce funcionando. Isso não afrouxa nada: o proxy só faz o
  // redirect de conveniência — quem protege de verdade é o getTenant() de
  // cada página e Server Action (ver seção 7 do plano de engenharia).
  matcher: ["/((?!_next/static|_next/image|api/auth|.*\\..*).*)"],
}
