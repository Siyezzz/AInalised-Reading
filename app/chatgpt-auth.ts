import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, accountForSession } from './lib/auth';

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_ID_HEADER = 'oai-authenticated-user-id';
const USER_EMAIL_HEADER = 'oai-authenticated-user-email';
const USER_FULL_NAME_HEADER = 'oai-authenticated-user-full-name';
const USER_FULL_NAME_ENCODING_HEADER =
  'oai-authenticated-user-full-name-encoding';
const PERCENT_ENCODED_UTF8 = 'percent-encoded-utf-8';
const CLOUDFLARE_ACCESS_EMAIL_HEADER = 'cf-access-authenticated-user-email';
const READER_ID_COOKIE = 'reader_id';
const SIGN_IN_PATH = '/signin';
const SIGN_OUT_PATH = '/signin';
const CALLBACK_PATH = '/callback';

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const cookieStore = await cookies();

  // 站点自己的登录会话优先：部署在 workers.dev 时没有平台注入的登录 header。
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionToken) {
    const account = await accountForSession(sessionToken);
    if (account) {
      return {
        userId: account.id,
        displayName: account.email,
        email: account.email,
        fullName: null,
      };
    }
  }

  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  const cloudflareEmail = requestHeaders.get(CLOUDFLARE_ACCESS_EMAIL_HEADER);
  const resolvedEmail = email ?? cloudflareEmail;
  const resolvedUserId = userId ?? (cloudflareEmail ? `cf:${cloudflareEmail.toLowerCase()}` : null);

  if (resolvedUserId && resolvedEmail) {
    const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
    const fullName =
      encodedFullName &&
      requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
        ? safeDecodeURIComponent(encodedFullName)
        : null;
    return {
      userId: resolvedUserId,
      displayName: fullName ?? resolvedEmail,
      email: resolvedEmail,
      fullName,
    };
  }

  // Fallback to anonymous cookie-based identity so the site works without OpenAI Sites / Cloudflare Access.
  const readerId = cookieStore.get(READER_ID_COOKIE)?.value;
  if (!readerId) return null;
  return {
    userId: `anon:${readerId}`,
    displayName: '读者',
    email: `${readerId.slice(0, 12)}@anon.local`,
    fullName: null,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = '/'): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';

  let url: URL;
  try {
    url = new URL(value, 'https://app.local');
  } catch {
    return '/';
  }
  if (url.origin !== 'https://app.local') return '/';
  if (isReservedAuthPath(url.pathname)) return '/';

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
