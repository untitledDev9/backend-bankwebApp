import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { validationResult } from 'express-validator';
import User from '../models/User';
import Account from '../models/Account';
import { AuthRequest } from '../middleware/protect';
import OTP_CODES from '../utils/otpCodes';

const signToken = (id: unknown, role: string): string => {
  return jwt.sign({ id: String(id), role }, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRY || '20m') as any,
  });
};

const signOtpToken = (id: unknown, role: string): string => {
  return jwt.sign({ id: String(id), role, otp_pending: true }, process.env.JWT_SECRET as string, {
    expiresIn: '5m',
  });
};

const sendTokenCookie = (res: Response, token: string): void => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'strict',
    maxAge: 20 * 60 * 1000,
    ...(isProduction && { partitioned: true }),
  });
};

// Customer login
export const login = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email, role: 'customer' }).select('+password');
    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid email or password.' });
      return;
    }

    if (!user.is_active) {
      res.status(401).json({ success: false, message: 'Account has been deactivated. Contact support.' });
      return;
    }

    if (user.isLocked()) {
      const minutes = Math.ceil(((user.lock_until as Date).getTime() - Date.now()) / 60000);
      res.status(423).json({
        success: false,
        message: `Account is temporarily locked due to too many failed attempts. Try again in ${minutes} minute(s).`,
      });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.login_attempts += 1;
      if (user.login_attempts >= 5) {
        user.lock_until = new Date(Date.now() + 15 * 60 * 1000);
      }
      await user.save({ validateBeforeSave: false });
      res.status(401).json({ success: false, message: 'Invalid email or password.' });
      return;
    }

    user.login_attempts = 0;
    user.lock_until = null;
    await user.save({ validateBeforeSave: false });

    // Issue OTP pending token — full auth requires OTP verification
    const otpToken = signOtpToken(user._id, user.role);

    res.json({ success: true, otp_required: true, otp_token: otpToken });
  } catch (error) {
    next(error);
  }
};

// Verify OTP for customer login
export const verifyOtp = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { otp_token, otp } = req.body;

    if (!otp_token || !otp) {
      res.status(400).json({ success: false, message: 'OTP token and code are required.' });
      return;
    }

    // Verify the OTP pending token
    let decoded: any;
    try {
      decoded = jwt.verify(otp_token, process.env.JWT_SECRET as string);
    } catch {
      res.status(401).json({ success: false, message: 'OTP session expired. Please log in again.' });
      return;
    }

    if (!decoded.otp_pending) {
      res.status(400).json({ success: false, message: 'Invalid OTP token.' });
      return;
    }

    // Check if the OTP is in the hardcoded list
    if (!OTP_CODES.includes(otp)) {
      res.status(401).json({ success: false, message: 'Invalid OTP code. Please try again.' });
      return;
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    // Issue real auth token
    const token = signToken(user._id, user.role);
    sendTokenCookie(res, token);

    res.json({ success: true, user: user.toJSON() });
  } catch (error) {
    next(error);
  }
};

// Admin login
export const adminLogin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email, role: 'admin' }).select('+password');
    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid email or password.' });
      return;
    }

    if (!user.is_active) {
      res.status(401).json({ success: false, message: 'Account has been deactivated.' });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid email or password.' });
      return;
    }

    const token = signToken(user._id, user.role);
    sendTokenCookie(res, token);

    res.json({ success: true, user: user.toJSON() });
  } catch (error) {
    next(error);
  }
};

// Logout
export const logout = (req: AuthRequest, res: Response): void => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('token', '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'strict',
    expires: new Date(0),
    ...(isProduction && { partitioned: true }),
  });
  res.json({ success: true, message: 'Logged out successfully.' });
};

// Get current user
export const getMe = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user!;
    let account = null;

    if (user.role === 'customer') {
      account = await Account.findOne({ user_id: user._id });
    }

    res.json({
      success: true,
      user: user.toJSON(),
      account: account
        ? {
            ...account.toObject(),
            masked_number: '****' + account.account_number.slice(-4),
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
};

// Forgot password
export const forgotPassword = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      res.json({ success: true, message: 'If an account with that email exists, a reset link has been sent.' });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.reset_token = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.reset_token_expiry = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    console.log(`Password reset URL: ${resetUrl}`);

    res.json({ success: true, message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (error) {
    next(error);
  }
};

// Reset password
export const resetPassword = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token as string).digest('hex');

    const user = await User.findOne({
      reset_token: hashedToken,
      reset_token_expiry: { $gt: Date.now() },
    }).select('+reset_token +reset_token_expiry');

    if (!user) {
      res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
      return;
    }

    const { password } = req.body;
    if (!password || password.length < 8) {
      res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
      return;
    }

    user.password = password;
    user.reset_token = undefined;
    user.reset_token_expiry = undefined;
    user.login_attempts = 0;
    user.lock_until = null;
    await user.save();

    res.json({ success: true, message: 'Password reset successful. You can now log in.' });
  } catch (error) {
    next(error);
  }
};
