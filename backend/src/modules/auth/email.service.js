const nodemailer = require('nodemailer');

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

async function sendPasswordResetEmail(to, link) {
  if (!isConfigured()) return false;

  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE.toLowerCase() === 'true'
    : port === 465;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  if (Boolean(user) !== Boolean(password)) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must both be configured');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    ...(user ? { auth: { user, pass: password } } : {}),
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'Reset your QueueSmart password',
    text: `Use this one-time link within 15 minutes to reset your QueueSmart password:\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Use this one-time link within 15 minutes to reset your QueueSmart password:</p><p><a href="${link}">Reset your password</a></p><p>If you did not request this, you can ignore this email.</p>`,
  });
  return true;
}

module.exports = { isConfigured, sendPasswordResetEmail };
