
/**
 * Generates a responsive, styled email template
 * @param {Object} options
 * @param {string} options.language - 'en', 'he', 'ru'
 * @param {string} options.title - Main title
 * @param {string} options.body - Main content (HTML allowed)
 * @param {Object} [options.cta] - Call to action button
 * @param {string} options.cta.text - Button text
 * @param {string} options.cta.link - Button URL
 * @param {string} [options.footer] - Footer text
 * @returns {string} HTML string
 */
export function getEmailTemplate({ language = 'en', title, body, cta, footer }) {
    const isRtl = language === 'he';
    const direction = isRtl ? 'rtl' : 'ltr';
    const textAlign = isRtl ? 'right' : 'left';

    const colors = {
        primary: '#5C8374', // Ascent Green
        bg: '#f4f4f5',
        card: '#ffffff',
        text: '#18181b', // zinc-900
        textSecondary: '#71717a', // zinc-500
        border: '#e4e4e7'
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: ${colors.bg}; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; direction: ${direction}; text-align: ${textAlign}; }
    .card { background-color: ${colors.card}; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
    .logo { text-align: center; margin-bottom: 30px; }
    .logo img { height: 40px; }
    .title { color: ${colors.primary}; margin-top: 0; font-size: 24px; font-weight: 700; margin-bottom: 24px; text-align: center; }
    .body { color: ${colors.text}; font-size: 16px; line-height: 1.6; margin-bottom: 32px; }
    .btn-container { text-align: center; margin: 32px 0; }
    .btn { background-color: ${colors.primary}; color: #ffffff !important; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.9; }
    .footer { text-align: center; margin-top: 32px; color: ${colors.textSecondary}; font-size: 13px; }
    .divider { border: 0; border-top: 1px solid ${colors.border}; margin: 32px 0; }
    .link-fallback { word-break: break-all; color: ${colors.primary}; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h2 style="color: ${colors.primary}; margin: 0; font-size: 28px;">Ascent</h2>
    </div>
    
    <div class="card">
      <h1 class="title">${title}</h1>
      
      <div class="body">
        ${body}
      </div>

      ${cta ? `
        <div class="btn-container">
          <a href="${cta.link}" class="btn">${cta.text}</a>
        </div>
      ` : ''}
      
      <div class="divider"></div>
      
      <p style="font-size: 14px; color: ${colors.textSecondary}; margin-bottom: 8px;">
        ${footer || (isRtl ? 'הודעה אוטומטית מאת צוות Ascent' : 'Automated message from The Ascent Team')}
      </p>
      
      ${cta ? `
        <div style="margin-top: 24px; font-size: 12px; color: ${colors.textSecondary}; text-align: center;">
          <p>${isRtl ? 'אם הלחץ למעלה אינו עובד, העתק את הקישור:' : 'If the button above doesn\'t work, copy this link:'}</p>
          <a href="${cta.link}" class="link-fallback">${cta.link}</a>
        </div>
      ` : ''}
    </div>
    
    <div class="footer">
      &copy; ${new Date().getFullYear()} Ascent. All rights reserved.
    </div>
  </div>
</body>
</html>
  `;
}
