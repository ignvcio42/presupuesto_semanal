import { withAuth } from 'next-auth/middleware';

export default withAuth(
  function middleware(_req) {
    // Aquí puedes agregar lógica adicional si es necesario
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Permitir acceso a la página de auth sin token
        if (req.nextUrl.pathname.startsWith('/auth')) {
          return true;
        }
        
        // Requerir token para todas las demás rutas
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth.js routes)
     * - api/trpc (TRPC routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/auth|api/trpc|_next/static|_next/image|favicon.ico).*)',
  ],
};
