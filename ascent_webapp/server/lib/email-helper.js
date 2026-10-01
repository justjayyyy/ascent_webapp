import nodemailer from 'nodemailer';

let transporter;
let transporterKey;

// Values pasted into a hosting dashboard often keep the quotes from a .env file ("587"), which would
// silently break the port and the credentials.
const clean = (value) => String(value ?? '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
const setting = (env, name) => clean(env[name]);

// One pooled connection per server instance, rebuilt only if the settings change.
// Certificates are checked unless SMTP_ALLOW_SELF_SIGNED=true (a private relay with its own certificate).
function getTransporter(env = process.env) {
  const port = parseInt(setting(env, 'SMTP_PORT'), 10) || 587;
  const options = {
    host: setting(env, 'SMTP_HOST') || 'smtp.gmail.com',
    port,
    secure: setting(env, 'SMTP_SECURE') === 'true' || port === 465,
    // Gmail shows app passwords with spaces; they are used without them
    auth: { user: setting(env, 'SMTP_USER'), pass: setting(env, 'SMTP_PASS').replace(/\s+/g, '') },
    pool: true,
    // A server that never answers must not hold the request until the function times out
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    tls: { rejectUnauthorized: setting(env, 'SMTP_ALLOW_SELF_SIGNED') !== 'true' },
  };
  const key = JSON.stringify(options);
  if (!transporter || key !== transporterKey) {
    transporter = nodemailer.createTransport(options);
    transporterKey = key;
  }
  return transporter;
}

export const emailConfigured = (env = process.env) => !!(setting(env, 'SMTP_USER') && setting(env, 'SMTP_PASS'));

/** Sends one email. Never throws: returns { sent: true, messageId } or { sent: false, error }. */
export async function sendEmail({ to, subject, body, html }) {
  if (!emailConfigured()) {
    console.warn('[Email] SMTP is not configured; not sent');
    return { sent: false, error: 'SMTP not configured' };
  }
  try {
    const result = await getTransporter().sendMail({
      from: setting(process.env, 'SMTP_FROM') || setting(process.env, 'SMTP_USER'),
      to,
      subject,
      text: body,
      html: html || undefined,
    });
    return { sent: true, messageId: result.messageId };
  } catch (err) {
    console.error('[Email] send failed:', err?.code || '', err?.responseCode || '', err?.message);
    return { sent: false, error: err?.message || 'send failed' };
  }
}
