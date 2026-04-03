const nodemailer = require('nodemailer');
const SITE_URL = process.env.SITE_URL || 'https://your-domain.com';

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER || 'test@ethereal.email',
      pass: process.env.SMTP_PASS || 'testpass'
    }
  });
}

async function sendEmail({ to, subject, html, text }) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"熊猫社区" <noreply@pandahub.cloud>',
    to,
    subject,
    html,
    text: text || subject
  });
}

module.exports = { sendEmail };
