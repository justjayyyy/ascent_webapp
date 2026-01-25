import { handleCors } from '../lib/cors.js';
import { success, error, serverError } from '../lib/response.js';
import { authMiddleware } from '../middleware/auth.js';
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  
  if (req.method !== 'POST') {
    return error(res, 'Method not allowed', 405);
  }

  try {
    const user = await authMiddleware(req, res);
    if (!user) return;

    const { to, subject, body, html } = req.body;

    if (!to || !subject) {
      return error(res, 'To and subject are required');
    }

    // Configure transporter based on environment
    // In production, use your email service (SendGrid, AWS SES, etc.)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // If SMTP is not configured, just log and return success (for development)
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('Email not sent - SMTP not configured. Email would be sent to:', to);
      console.warn('Subject:', subject);
      console.warn('Body:', body);
      return success(res, { 
        sent: false, 
        message: 'Email not sent (SMTP not configured). Please configure SMTP_USER and SMTP_PASS in .env file.' 
      });
    }

    try {
      await transporter.verify();
    } catch (verifyError) {
      console.error('SMTP verification failed:', verifyError);
      // Return a more user-friendly error message
      const errorMsg = verifyError.message || 'Unknown SMTP error';
      if (errorMsg.includes('BadCredentials') || errorMsg.includes('Invalid login')) {
        return error(res, `SMTP configuration error: Invalid Gmail credentials. Please generate a new App Password at https://myaccount.google.com/apppasswords and update SMTP_PASS in .env file. Error: ${errorMsg}`, 500);
      }
      return error(res, `SMTP configuration error: ${errorMsg}`, 500);
    }

    const mailResult = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: body,
      html: html || body
    });

    console.log('Email sent successfully:', { to, messageId: mailResult.messageId });
    return success(res, { sent: true, messageId: mailResult.messageId });

  } catch (err) {
    console.error('Email sending error:', err);
    // If it's an SMTP auth error, provide helpful message
    const errorMsg = err.message || 'Unknown error';
    if (errorMsg.includes('BadCredentials') || errorMsg.includes('Invalid login')) {
      return error(res, `SMTP authentication failed: Invalid Gmail credentials. Please generate a new App Password at https://myaccount.google.com/apppasswords and update SMTP_PASS in .env file.`, 500);
    }
    return serverError(res, err);
  }
}

