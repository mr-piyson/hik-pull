import { betterFetch } from "@better-fetch/fetch";
import { type NextRequest, NextResponse } from "next/server";

type Session = {
  user: {
    id: string;
    email: string;
    name: string;
    role?: string;
  };
};

export async function middleware(request: NextRequest) {
  const { data: session } = await betterFetch<Session>(
    "/api/auth/get-session",
    {
      baseURL: request.nextUrl.origin,
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    },
  );

  const pathname = request.nextUrl.pathname;

  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (
    (pathname === "/users" || pathname.startsWith("/users/")) &&
    session.user.role !== "admin"
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth|api/trpc|sign-in|sign-up|_next/static|_next/image|favicon.ico).*)",
  ],
};
