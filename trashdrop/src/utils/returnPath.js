/**
 * Where to go after signing in: a page inside this app (from ?next= or the
 * route guard's `from`), never another site or the sign-in pages themselves.
 * Returns null when there is nowhere safe to return to.
 */
const NO_RETURN = ['/login', '/register', '/reset-password', '/forgot-password'];

export function safeReturnPath(path) {
  if (typeof path !== 'string') return null;
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
  if ([...path].some((c) => c.charCodeAt(0) < 32)) return null;
  const pathname = path.split(/[?#]/)[0];
  if (pathname === '/' || NO_RETURN.includes(pathname)) return null;
  return path;
}

/** The return path from a router location: ?next= first, then state.from */
export function returnPathFrom(location) {
  let next = null;
  try {
    next = new URLSearchParams(location?.search || '').get('next');
  } catch {
    next = null;
  }
  const from = location?.state?.from;
  const fromPath = from && typeof from === 'object' ? `${from.pathname || ''}${from.search || ''}` : from;
  return safeReturnPath(next) || safeReturnPath(fromPath);
}
