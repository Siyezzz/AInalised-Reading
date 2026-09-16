import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 与 app/lib/auth.ts 里的 SESSION_COOKIE 保持一致。
const SESSION_COOKIE = 'zhiji_session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 登录/注册页本身要放行，否则会把访客永远挡在死循环里。
  const isAuthPath = pathname.startsWith('/signin') || pathname.startsWith('/api/auth');

  // 尚未登录：引导到登录页，并记下想去的页面，登录后跳回来。
  if (!isAuthPath && !request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.searchParams.set('return_to', pathname);
    return NextResponse.redirect(url);
  }

  // 给匿名访客补一个 reader_id（登录后会把匿名数据并进账号）。
  if (!request.cookies.get('reader_id')?.value) {
    const response = NextResponse.next();
    response.cookies.set('reader_id', crypto.randomUUID(), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
