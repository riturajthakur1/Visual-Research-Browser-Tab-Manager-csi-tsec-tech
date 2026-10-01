// What is never captured: private pages, sign-in flows and sensitive sites.

export const DEFAULT_BLOCKLIST = [
  // mail and messaging
  'mail.google.com', 'outlook.live.com', 'outlook.office.com', 'mail.yahoo.com', 'proton.me', 'web.whatsapp.com',
  'web.telegram.org', 'messenger.com', 'discord.com', 'slack.com', 'teams.microsoft.com',
  // identity and accounts
  'accounts.google.com', 'login.microsoftonline.com', 'login.live.com', 'appleid.apple.com', 'auth0.com', 'okta.com',
  // money
  'paypal.com', 'stripe.com', 'paytm.com', 'phonepe.com', 'razorpay.com', 'onlinesbi.sbi', 'hdfcbank.com',
  'icicibank.com', 'axisbank.com', 'kotak.com', 'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'zerodha.com',
  'groww.in', 'coinbase.com', 'binance.com',
  // health records
  'mychart.org', 'practo.com', '1mg.com',
  // passwords
  'bitwarden.com', '1password.com', 'lastpass.com',
];

const SENSITIVE_PATH = /\/(login|log-in|signin|sign-in|signup|sign-up|auth|oauth2?|sso|account|checkout|payment|billing|password|reset)(\/|$|\?)/i;
const SENSITIVE_HOST = /(^|\.)(bank|banking|netbanking|ibank|secure)[.-]/i;

/** True for pages Thread.io must never read or store. */
export function isBlocked(rawUrl: string, blocklist: string[]): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return true;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
  const host = url.hostname.replace(/^www\./, '');
  if (blocklist.some((b) => host === b || host.endsWith('.' + b))) return true;
  if (SENSITIVE_HOST.test(host)) return true;
  if (SENSITIVE_PATH.test(url.pathname)) return true;
  return false;
}

/** Removes characters often used to hide instructions inside page text. */
export function sanitizeForModel(text: string): string {
  return text
    .replace(/[​-‏‪-‮⁠-⁤﻿]/g, '')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
