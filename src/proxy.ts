import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const password = process.env.STUDIO_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth")) return NextResponse.next();

  const ok = req.cookies.get(AUTH_COOKIE)?.value === (await authToken(password));
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // templates/static files are public; everything else (pages + API + data files) is protected
  matcher: ["/((?!_next/static|_next/image|favicon.ico|templates/|fonts/).*)"],
};
