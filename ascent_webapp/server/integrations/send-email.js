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
    if (!user) {
      // authMiddleware already sent the response, just return
      return;
    }

    const { to, subject, body, html } = req.body;

    if (!to || !subject) {
      return error(res, 'To and subject are required');
    }

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

    // Configure transporter based on environment
    // In production, use your email service (SendGrid, AWS SES, etc.)
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

    // Verify SMTP connection
    try {
      console.log('Verifying SMTP connection...', { 
        host: process.env.SMTP_HOST, 
        port: smtpPort, 
        secure: smtpSecure,
        user: process.env.SMTP_USER 
      });
      await transporter.verify();
      console.log('SMTP verification successful');
    } catch (verifyError) {
      console.error('SMTP verification failed:', {
        message: verifyError.message,
        code: verifyError.code,
        command: verifyError.command,
        response: verifyError.response,
        responseCode: verifyError.responseCode
      });
      // Return a more user-friendly error message
      const errorMsg = verifyError.message || 'Unknown SMTP error';
      const errorCode = verifyError.code || '';
      
      if (errorMsg.includes('BadCredentials') || errorMsg.includes('Invalid login') || errorMsg.includes('EAUTH') || errorCode === 'EAUTH') {
        return error(res, `SMTP configuration error: Invalid email credentials. Please check your SMTP_USER and SMTP_PASS. For Gmail, generate a new App Password at https://myaccount.google.com/apppasswords and update SMTP_PASS in .env file. Error: ${errorMsg}`, 500);
      }
      if (errorMsg.includes('ECONNECTION') || errorMsg.includes('ETIMEDOUT') || errorCode === 'ECONNECTION' || errorCode === 'ETIMEDOUT') {
        return error(res, `SMTP connection error: Unable to connect to ${process.env.SMTP_HOST || 'smtp.gmail.com'}. Please check your SMTP_HOST and SMTP_PORT settings. Error: ${errorMsg}`, 500);
      }
      return error(res, `SMTP configuration error: ${errorMsg}`, 500);
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
      return success(res, { sent: true, messageId: mailResult.messageId });
    } catch (sendError) {
      console.error('Email send failed:', {
        message: sendError.message,
        code: sendError.code,
        command: sendError.command,
        response: sendError.response,
        responseCode: sendError.responseCode
      });
      const errorMsg = sendError.message || 'Unknown error';
      const errorCode = sendError.code || '';
      
      if (errorMsg.includes('BadCredentials') || errorMsg.includes('Invalid login') || errorMsg.includes('EAUTH') || errorCode === 'EAUTH') {
        return error(res, `SMTP authentication failed: Invalid email credentials. Please check your SMTP_USER and SMTP_PASS. For Gmail, generate a new App Password at https://myaccount.google.com/apppasswords and update SMTP_PASS in .env file.`, 500);
      }
      return error(res, `Failed to send email: ${errorMsg}`, 500);
    }

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

