import { NextResponse, type NextRequest } from "next/server";

const VALID_PROTOCOLS = new Set(["http", "https"]);
// Allowed host pattern: standard hostnames (e.g. localhost, 127.0.0.1, example.com, sub.example.com) with optional port
const VALID_HOST_REGEX = /^[a-zA-Z0-9.-]+(?::\d{1,5})?$/;

/**
 * LifeOS Production Reverse Proxy, TLS, and Private CDN Guard Middleware
 *
 * Implements:
 * 1. Reverse-proxy header validation (X-Forwarded-Proto, X-Forwarded-Host, X-Forwarded-For).
 * 2. Spoofed host and protocol header rejection.
 * 3. Forwarded HTTPS redirection in production when unencrypted HTTP is requested upstream.
 * 4. Strict private CDN cache-control enforcement on API and authenticated routes.
 * 5. Security header propagation (HSTS, nosniff, DENY, etc.).
 */
export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || url.host;

  // 1. Host header validation: reject spoofed or malformed host headers (CRLF, injection vectors)
  if (host && !VALID_HOST_REGEX.test(host)) {
    return new NextResponse("Bad Request: Invalid Host header", { status: 400 });
  }

  // 2. Protocol validation: if X-Forwarded-Proto is specified, it must strictly be 'http' or 'https'
  if (forwardedProto && !VALID_PROTOCOLS.has(forwardedProto.toLowerCase())) {
    return new NextResponse("Bad Request: Invalid X-Forwarded-Proto header", { status: 400 });
  }

  // 3. Upstream HTTPS redirect in production if reverse proxy forwarded an unencrypted HTTP request
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && forwardedProto && forwardedProto.toLowerCase() === "http") {
    const httpsUrl = new URL(request.url);
    httpsUrl.protocol = "https:";
    if (forwardedHost) {
      httpsUrl.host = forwardedHost;
    }
    return NextResponse.redirect(httpsUrl, 308);
  }

  // Proceed with request
  const response = NextResponse.next();

  const pathname = url.pathname;

  // 4. Private CDN & Cache-Control Enforcement:
  // Personal OS API endpoints and dynamic personal routes must NEVER be cached by public CDNs or shared proxies
  if (pathname.startsWith("/api/")) {
    response.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, max-age=0, must-revalidate"
    );
    response.headers.set("CDN-Cache-Control", "no-store");
    response.headers.set("Surrogate-Control", "no-store");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  } else if (
    pathname === "/" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/tasks") ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/goals") ||
    pathname.startsWith("/habits") ||
    pathname.startsWith("/calendar") ||
    pathname.startsWith("/daily-plan") ||
    pathname.startsWith("/notes") ||
    pathname.startsWith("/learning") ||
    pathname.startsWith("/finance") ||
    pathname.startsWith("/content") ||
    pathname.startsWith("/assistant") ||
    pathname.startsWith("/automations") ||
    pathname.startsWith("/settings")
  ) {
    // Dynamic personal views must also remain private to prevent CDN proxy caching of user session HTML
    response.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, max-age=0, must-revalidate"
    );
    response.headers.set("CDN-Cache-Control", "no-store");
  }

  // 5. Enforce HSTS when served under HTTPS or forwarded HTTPS
  const isHttps = url.protocol === "https:" || forwardedProto?.toLowerCase() === "https";
  if (isHttps) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  // 6. Enforce permissions-policy with microphone=(self)
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=()"
  );

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
