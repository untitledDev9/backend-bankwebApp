const base = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NileTrust Bank</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f0;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="background-color:#1c1917;border-radius:16px 16px 0 0;padding:28px 36px;text-align:center;">
              <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">NileTrust</span>
              <span style="font-size:22px;font-weight:300;color:#a8a29e;letter-spacing:-0.5px;"> Bank</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:40px 36px;border-left:1px solid #e7e5e4;border-right:1px solid #e7e5e4;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9f8f7;border:1px solid #e7e5e4;border-top:none;border-radius:0 0 16px 16px;padding:20px 36px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#a8a29e;">© ${new Date().getFullYear()} NileTrust Bank. All rights reserved.</p>
              <p style="margin:0;font-size:12px;color:#d6d3d1;">This is an automated email — please do not reply.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export const otpEmail = (otp: string, isResend = false) =>
  base(`
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;width:64px;height:64px;background-color:#f5f5f4;border-radius:50%;line-height:64px;font-size:28px;margin-bottom:16px;">🔐</div>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1c1917;">${isResend ? 'New Verification Code' : 'Verify Your Login'}</h1>
      <p style="margin:0;font-size:15px;color:#78716c;">
        ${isResend ? 'Here is your new one-time verification code.' : 'Use the code below to complete your login.'}
      </p>
    </div>

    <div style="background-color:#f5f5f4;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#a8a29e;text-transform:uppercase;letter-spacing:1px;">Your verification code</p>
      <p style="margin:0;font-size:42px;font-weight:700;color:#1c1917;letter-spacing:12px;font-family:'Courier New',monospace;">${otp}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="background-color:#fef9f0;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;">
          <p style="margin:0;font-size:13px;color:#92400e;">
            ⏱ This code expires in <strong>10 minutes</strong>. Never share it with anyone.
          </p>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#a8a29e;text-align:center;">
      If you did not attempt to log in, please ignore this email and your account will remain secure.
    </p>
  `);

export const passwordResetEmail = (resetUrl: string) =>
  base(`
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;width:64px;height:64px;background-color:#f5f5f4;border-radius:50%;line-height:64px;font-size:28px;margin-bottom:16px;">🔑</div>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1c1917;">Reset Your Password</h1>
      <p style="margin:0;font-size:15px;color:#78716c;">We received a request to reset the password for your account.</p>
    </div>

    <p style="margin:0 0 24px;font-size:15px;color:#44403c;line-height:1.6;">
      Click the button below to set a new password. This link is valid for <strong>1 hour</strong>.
    </p>

    <div style="text-align:center;margin-bottom:28px;">
      <a href="${resetUrl}" style="display:inline-block;background-color:#1c1917;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;letter-spacing:0.2px;">
        Reset Password
      </a>
    </div>

    <p style="margin:0 0 20px;font-size:13px;color:#78716c;text-align:center;">
      Or copy and paste this link into your browser:
    </p>
    <div style="background-color:#f5f5f4;border-radius:8px;padding:12px 16px;word-break:break-all;margin-bottom:28px;">
      <a href="${resetUrl}" style="font-size:12px;color:#44403c;font-family:'Courier New',monospace;">${resetUrl}</a>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 18px;">
          <p style="margin:0;font-size:13px;color:#991b1b;">
            🔒 If you did not request a password reset, please ignore this email. Your password will not change.
          </p>
        </td>
      </tr>
    </table>
  `);

export const fundsReceivedEmail = (
  recipientName: string,
  senderName: string,
  amount: string,
  currency: string,
  description: string,
) =>
  base(`
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;width:64px;height:64px;background-color:#f0fdf4;border-radius:50%;line-height:64px;font-size:28px;margin-bottom:16px;">💸</div>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1c1917;">Funds Received</h1>
      <p style="margin:0;font-size:15px;color:#78716c;">Hello ${recipientName}, money has landed in your account.</p>
    </div>

    <div style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:1px;">Amount Credited</p>
      <p style="margin:0;font-size:40px;font-weight:700;color:#15803d;">${currency}${amount}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;border:1px solid #e7e5e4;border-radius:10px;overflow:hidden;">
      <tr style="border-bottom:1px solid #e7e5e4;">
        <td style="padding:14px 18px;font-size:13px;color:#78716c;width:40%;">From</td>
        <td style="padding:14px 18px;font-size:14px;font-weight:600;color:#1c1917;">${senderName}</td>
      </tr>
      <tr style="border-bottom:1px solid #e7e5e4;">
        <td style="padding:14px 18px;font-size:13px;color:#78716c;">To</td>
        <td style="padding:14px 18px;font-size:14px;font-weight:600;color:#1c1917;">${recipientName}</td>
      </tr>
      ${description ? `<tr>
        <td style="padding:14px 18px;font-size:13px;color:#78716c;">Note</td>
        <td style="padding:14px 18px;font-size:14px;color:#44403c;">${description}</td>
      </tr>` : ''}
      <tr>
        <td style="padding:14px 18px;font-size:13px;color:#78716c;">Date</td>
        <td style="padding:14px 18px;font-size:14px;color:#44403c;">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#a8a29e;text-align:center;">
      Log in to your NileTrust account to view your updated balance and full transaction history.
    </p>
  `);
