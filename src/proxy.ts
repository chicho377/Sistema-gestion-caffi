import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseEnv } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  const env = publicSupabaseEnv();
  const protectedPath =
    request.nextUrl.pathname === "/" ||
    /^\/(dashboard|usuarios|mas)(\/|$)/.test(request.nextUrl.pathname);
  const deny = () => {
    const url = new URL("/login", request.url);
    url.searchParams.set("notice", "session");
    const denied = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
    denied.headers.set("Cache-Control", "private, no-store");
    return denied;
  };
  if (!env) return protectedPath ? deny() : response;
  const client = createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });
  try {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (protectedPath) {
      if (!user) return deny();
      const { data } = await client
        .from("profiles")
        .select("status")
        .eq("id", user.id)
        .single();
      if (data?.status !== "active") return deny();
    }
  } catch {
    if (protectedPath) return deny();
  }
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
