import 'dotenv/config';
import nodemailer from 'nodemailer';

const MONGODB_URI = process.env.MONGODB_URI;

if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
  console.error('❌ SMTP_USER or SMTP_PASS not found in environment variables');
  process.exit(1);
}

async function testEmail() {
  console.log('🧪 Testing SMTP Configuration...\n');
  console.log('Configuration:');
  console.log(`  Host: ${process.env.SMTP_HOST || 'smtp.gmail.com'}`);
  console.log(`  Port: ${process.env.SMTP_PORT || '587'}`);
  console.log(`  User: ${process.env.SMTP_USER}`);
  console.log(`  Password: ${process.env.SMTP_PASS ? '***SET***' : 'NOT SET'}\n`);

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
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔍 Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully!\n');

    console.log('📧 Sending test email...');
    const testEmail = process.env.SMTP_USER; // Send to self
    const mailResult = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: testEmail,
      subject: 'Test Email from Ascent App',
      text: 'This is a test email from the Ascent application. If you receive this, your SMTP configuration is working correctly!',
      html: '<p>This is a test email from the Ascent application.</p><p>If you receive this, your SMTP configuration is working correctly!</p>'
    });

    console.log('✅ Test email sent successfully!');
    console.log(`   Message ID: ${mailResult.messageId}`);
    console.log(`   Sent to: ${testEmail}`);
    console.log('\n💡 Check your inbox (and spam folder) for the test email.');

  } catch (error) {
    console.error('\n❌ Email test failed:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Code: ${error.code || 'N/A'}`);
    
    if (error.response) {
      console.error(`   Response: ${error.response}`);
    }
    
    if (error.message.includes('BadCredentials') || error.message.includes('Invalid login') || error.message.includes('EAUTH') || error.code === 'EAUTH') {
      console.error('\n💡 This appears to be an authentication error.');
      console.error('   Please:');
      console.error('   1. Generate a new App Password at: https://myaccount.google.com/apppasswords');
      console.error('   2. Update SMTP_PASS in your .env file');
      console.error('   3. Make sure 2-Step Verification is enabled on your Google account');
    } else if (error.message.includes('ECONNECTION') || error.message.includes('ETIMEDOUT')) {
      console.error('\n💡 This appears to be a connection error.');
      console.error('   Please check:');
      console.error('   - Your internet connection');
      console.error('   - SMTP_HOST and SMTP_PORT settings');
      console.error('   - Firewall settings');
    }
    
    process.exit(1);
  }
}

testEmail()
  .then(() => {
    console.log('\n✨ Email test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Email test failed:', error);
    process.exit(1);
  });
