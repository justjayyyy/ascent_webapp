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
    if (!process.env.SMTP_USER) {
      console.log('Email would be sent:', { to, subject, body });
      return success(res, { 
        sent: false, 
        message: 'Email not sent (SMTP not configured)' 
      });
    }

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: body,
      html: html || body
    });

    return success(res, { sent: true });

  } catch (err) {
    return serverError(res, err);
  }
}

