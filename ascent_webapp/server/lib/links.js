// Where links in emails point. A request's Origin header is chosen by whoever sends the request, so in
// production links always use the configured app URL: otherwise someone could ask for a password reset
// for another person with their own Origin and receive the token through the link.
import { isAllowedOrigin } from './cors.js';

export const appUrl = (env = process.env) =>
  (env.FRONTEND_URL || env.NEXT_PUBLIC_APP_URL || 'https://ascentwebapp.vercel.app').replace(/\/+$/, '');

/** The origin for links in emails sent while handling `req`. */
export function linkOrigin(req, env = process.env) {
  const origin = req?.headers?.origin;
  if (env.VERCEL_ENV !== 'production' && isAllowedOrigin(origin, { host: req?.headers?.host, env })) {
    return String(origin).replace(/\/+$/, '');
  }
  return appUrl(env);
}
