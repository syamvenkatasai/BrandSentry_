import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Per-request CSP nonce, following Next.js's own documented pattern for
// script-src nonces on the Pages Router: generated here, threaded through
// to pages/_document.tsx via the x-nonce request header (read there and
// applied to NextScript's own injected chunks), and set directly on the
// response's Content-Security-Policy header. 'strict-dynamic' lets
// webpack's code-split chunks (this app dynamically imports jspdf,
// html2canvas, xlsx, dompurify) inherit trust from the nonce'd script that
// triggers them, without which those dynamic imports would be blocked
// even though the initiating script is trusted.
//
// 'unsafe-eval' is dev-only — Next.js's dev-mode webpack config uses
// eval() for its default source-map devtool (Fast Refresh's error
// overlay depends on it), so a strict CSP would break `next dev` locally.
// Production builds (`next build` + `next start`, see Dockerfile) don't
// use eval() for their own bundles, so this narrows to nothing in prod.
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV !== 'production';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const cspHeader = [
    "default-src 'self'",
    scriptSrc,
    // style-src keeps 'unsafe-inline' — Tailwind/Radix apply inline styles
    // at runtime (e.g. Radix's positioning) that aren't practical to nonce
    // individually; style injection can't execute script directly, a much
    // narrower risk than script-src's, which is why only the latter is
    // nonce-gated here.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiUrl}`,
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('Content-Security-Policy', cspHeader);
  return response;
}

export const config = {
  // Skip static assets and Next's own internals — a nonce'd CSP on those
  // achieves nothing (no HTML/script execution context) and would just add
  // per-request overhead to every asset request.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
