require('ts-node').register({ transpileOnly: true });
const nodemailer = require('nodemailer');
const { otpEmail } = require('./utils/emailTemplates');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: 'niletrustbank@gmail.com', pass: 'smutacfiyndymaee' },
});

transporter.sendMail({
  from: 'NileTrust Bank <niletrustbank@gmail.com>',
  to: 'ahmedsuleiman940@gmail.com',
  subject: 'NileTrust Bank — Login Verification Code',
  text: 'Your verification code is: 847291. Expires in 10 minutes.',
  html: otpEmail('847291'),
}).then(info => console.log('Sent:', info.messageId)).catch(err => console.error(err.message));
