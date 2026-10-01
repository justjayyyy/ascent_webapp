import nodemailer from 'nodemailer';

let transporter;
let transporterKey;

// One pooled connection per server instance, rebuilt only if the settings change.
// Certificates are checked unless SMTP_ALLOW_SELF_SIGNED=true (a private relay with its own certificate).
function getTransporter(env = process.env) {
  const port = parseInt(env.SMTP_PORT || '587', 10);
  const options = {
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: env.SMTP_SECURE === 'true' || port === 465,
    // Gmail shows app passwords with spaces; they are used without them
    auth: { user: env.SMTP_USER, pass: (env.SMTP_PASS || '').replace(/\s+/g, '') },
    pool: true,
    tls: { rejectUnauthorized: env.SMTP_ALLOW_SELF_SIGNED !== 'true' },
  };
  const key = JSON.stringify(options);
  if (!transporter || key !== transporterKey) {
    transporter = nodemailer.createTransport(options);
    transporterKey = key;
  }
  return transporter;
}

export const emailConfigured = (env = process.env) => !!(env.SMTP_USER && env.SMTP_PASS);

/** Sends one email. Never throws: returns { sent: true, messageId } or { sent: false, error }. */
export async function sendEmail({ to, subject, body, html }) {
  if (!emailConfigured()) {
    console.warn('[Email] SMTP is not configured; not sent');
    return { sent: false, error: 'SMTP not configured' };
  }
  try {
    const result = await getTransporter().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: body,
      html: html || undefined,
    });
    return { sent: true, messageId: result.messageId };
  } catch (err) {
    console.error('[Email] send failed:', err?.code || '', err?.message);
    return { sent: false, error: err?.message || 'send failed' };
  }
}
