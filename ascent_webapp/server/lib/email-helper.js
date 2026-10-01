// Values pasted into a hosting dashboard often keep the quotes from a .env file ("587"), which would
// silently break the port and the credentials.
const env = (name) => String(process.env[name] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();

export async function sendEmail({ to, subject, body, html }) {
  const user = env('SMTP_USER');
  // Remove spaces from password (Gmail App Passwords are displayed with spaces but should be used without)
  const pass = env('SMTP_PASS').replace(/\s+/g, '');
  if (!user || !pass) {
    console.warn('Email not sent - SMTP not configured (SMTP_USER / SMTP_PASS). Email would be sent to:', to);
    return { sent: false, message: 'SMTP not configured' };
  }

  const smtpPort = parseInt(env('SMTP_PORT'), 10) || 587;
  const smtpSecure = env('SMTP_SECURE') === 'true' || smtpPort === 465;

  const transporter = nodemailer.createTransport({
    host: env('SMTP_HOST') || 'smtp.gmail.com',
    port: smtpPort,
    secure: smtpSecure,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    tls: {
      rejectUnauthorized: false // Allow self-signed certificates
    }
  });

  // Send email
  try {
    const mailResult = await transporter.sendMail({
      from: env('SMTP_FROM') || user,
      to,
      subject,
      text: body,
      html: html || body
    });

    console.log('Email sent successfully:', { to, messageId: mailResult.messageId });
    return { sent: true, messageId: mailResult.messageId };
  } catch (sendError) {
    console.error('Email send failed:', {
      message: sendError.message,
      code: sendError.code,
      command: sendError.command,
      response: sendError.response,
      responseCode: sendError.responseCode
    });
    return { sent: false, error: sendError.message };
  }
}
