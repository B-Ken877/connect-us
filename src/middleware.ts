import { NextRequest, NextResponse } from "next/server";
import { NOM_COOKIE, verifierTokenSession } from "@/lib/auth/session-core";
import { accesAutorise, ACCUEIL_PAR_ROLE, estRoutePublique } from "@/lib/auth/permissions";

/**
 * Edge middleware — first layer of route protection:
 *  1. redirects "/" to the role home page (or login),
 *  2. blocks unauthenticated access to every non-public route,
 *  3. enforces the role → route matrix.
 *
 * NOTE: middleware is a first barrier only. Every Server Action and Route
 * Handler re-verifies session + role server-side (defense in depth).
 */
export async function middleware(request: NextRequest) {
  const chemin = request.nextUrl.pathname;

  if (estRoutePublique(chemin)) {
    if (chemin === "/connexion") {
      const session = await sessionDepuisRequete(request);
      if (session) return NextResponse.redirect(new URL(ACCUEIL_PAR_ROLE[session.role], request.url));
    }
    return NextResponse.next();
  }

  const session = await sessionDepuisRequete(request);

  if (!session) {
    if (chemin.startsWith("/api/")) {
      return NextResponse.json({ erreur: "SESSION_EXPIREE" }, { status: 401 });
    }
    const url = new URL("/connexion", request.url);
    url.searchParams.set("expiree", "1");
    return NextResponse.redirect(url);
  }

  if (!accesAutorise(chemin, session.role)) {
    if (chemin.startsWith("/api/")) {
      return NextResponse.json({ erreur: "ACCES_REFUSE" }, { status: 403 });
    }
    return NextResponse.redirect(new URL(ACCUEIL_PAR_ROLE[session.role], request.url));
  }

  return NextResponse.next();
}

async function sessionDepuisRequete(request: NextRequest) {
  const token = request.cookies.get(NOM_COOKIE)?.value;
  if (!token) return null;
  return verifierTokenSession(token);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images|manifest.webmanifest).*)"],
};
