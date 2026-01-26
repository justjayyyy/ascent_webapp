import nodemailer from 'nodemailer';

export async function sendEmail({ to, subject, body, html }) {
  // If SMTP is not configured, return false
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('Email not sent - SMTP not configured. Email would be sent to:', to);
    return { sent: false, message: 'SMTP not configured' };
  }

  // Configure transporter based on environment
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
  
  // Remove spaces from password (Gmail App Passwords are displayed with spaces but should be used without)
  const smtpPassword = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
  
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: process.env.SMTP_USER,
      pass: smtpPassword
    },
    tls: {
      rejectUnauthorized: false // Allow self-signed certificates
    }
  });

  try {
    // Verify SMTP connection
    await transporter.verify();
  } catch (verifyError) {
    console.error('SMTP verification failed:', verifyError);
    return { sent: false, error: verifyError.message };
  }

  // Send email
  try {
    const mailResult = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
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
