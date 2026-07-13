import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { validationResult } from 'express-validator';
import User from '../models/User';
import Account from '../models/Account';
import Transaction from '../models/Transaction';
import ProcessedRequest from '../models/ProcessedRequest';
import { AuthRequest } from '../middleware/protect';
import sendEmail from '../utils/sendEmail';

async function checkPin(submitted: string, stored: string): Promise<boolean> {
  if (stored.startsWith('$2')) return bcrypt.compare(submitted, stored);
  return submitted === stored;
}

// Get customer profile + account
export const getMe = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const account = await Account.findOne({ user_id: req.user!._id });
    if (!account) {
      res.status(404).json({ success: false, message: 'Account not found.' });
      return;
    }

    const fullUser = await User.findById(req.user!._id).select('+transaction_pin');
    const userData = req.user!.toJSON();
    userData.has_transaction_pin = !!fullUser?.transaction_pin;

    res.json({
      success: true,
      user: userData,
      account: {
        ...account.toObject(),
        masked_number: '****' + account.account_number.slice(-4),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get transactions with pagination, filters, search
export const getTransactions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const account = await Account.findOne({ user_id: req.user!._id });
    if (!account) {
      res.status(404).json({ success: false, message: 'Account not found.' });
      return;
    }

    const {
      page = '1',
      limit = '20',
      type,
      search,
      start_date,
      end_date,
    } = req.query as Record<string, string>;

    const query: any = { account_id: account._id, type: { $ne: 'adjustment' } };

    if (type && ['debit', 'credit'].includes(type)) {
      query.type = type;
    }

    if (search) {
      query.description = { $regex: search, $options: 'i' };
    }

    if (start_date || end_date) {
      query.created_at = {};
      if (start_date) query.created_at.$gte = new Date(start_date);
      if (end_date) query.created_at.$lte = new Date(end_date);
    }

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const skip = (pageNum - 1) * limitNum;
    const total = await Transaction.countDocuments(query);

    const transactions = await Transaction.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      success: true,
      transactions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

// External bank transfer
export const withdraw = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    // Idempotency: return cached result for duplicate requests
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (idempotencyKey) {
      const existing = await ProcessedRequest.findOne({ key: `withdraw:${idempotencyKey}` });
      if (existing) {
        res.json(existing.result);
        return;
      }
    }

    const {
      amount,
      transaction_pin,
      bank_name,
      recipient_account_number,
      recipient_name,
      routing_number,
      swift_code,
      description,
    } = req.body;

    const numAmount = Number(amount);

    const user = await User.findById(req.user!._id).select('+transaction_pin');
    if (!user || !user.is_verified) {
      res.status(403).json({
        success: false,
        code: 'UNVERIFIED',
        message:
          'Your account verification is pending. External transfers are available once your identity has been reviewed and approved. Please contact support for assistance.',
      });
      return;
    }

    if (user.transaction_pin) {
      if (!transaction_pin) {
        res.status(400).json({ success: false, code: 'PIN_REQUIRED', message: 'Transaction PIN is required.' });
        return;
      }
      const pinMatch = await checkPin(String(transaction_pin), user.transaction_pin);
      if (!pinMatch) {
        res.status(400).json({ success: false, code: 'INVALID_PIN', message: 'Invalid transaction PIN.' });
        return;
      }
    }

    const desc = description?.trim() || `External Transfer to ${recipient_name} (${bank_name})`;

    // Atomic debit: only succeeds if balance >= amount
    const account = await Account.findOneAndUpdate(
      { user_id: req.user!._id, balance: { $gte: numAmount } },
      { $inc: { balance: -numAmount }, $set: { updated_at: new Date() } },
      { new: true },
    );

    if (!account) {
      const exists = await Account.exists({ user_id: req.user!._id });
      if (!exists) {
        res.status(404).json({ success: false, message: 'Account not found.' });
      } else {
        res.status(400).json({ success: false, message: 'Insufficient balance.' });
      }
      return;
    }

    const transaction = await Transaction.create({
      account_id: account._id,
      type: 'debit',
      amount: numAmount,
      balance_after: account.balance,
      description: desc,
      metadata: { bank_name, recipient_account_number, recipient_name, routing_number, swift_code },
      created_by: req.user!._id,
    });

    const responseBody = {
      success: true,
      message: 'External transfer initiated successfully.',
      balance: account.balance,
      transaction,
    };

    if (idempotencyKey) {
      ProcessedRequest.create({ key: `withdraw:${idempotencyKey}`, result: responseBody }).catch(() => {});
    }

    res.json(responseBody);
  } catch (error) {
    next(error);
  }
};

// Update profile
export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { full_name, email, phone } = req.body;
    const user = await User.findById(req.user!._id);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    if (full_name) user.full_name = full_name.trim();
    if (email && email !== user.email) {
      const exists = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
      if (exists) {
        res.status(400).json({ success: false, message: 'Email already in use.' });
        return;
      }
      user.email = email.toLowerCase().trim();
    }
    if (phone !== undefined) user.phone = phone.trim();

    await user.save({ validateBeforeSave: false });

    res.json({ success: true, user: user.toJSON(), message: 'Profile updated successfully.' });
  } catch (error) {
    next(error);
  }
};

// Change password
export const changePassword = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      res.status(400).json({ success: false, message: 'Current and new password are required.' });
      return;
    }
    if (new_password.length < 8) {
      res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
      return;
    }

    const user = await User.findById(req.user!._id).select('+password');
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    const isMatch = await user.comparePassword(current_password);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Current password is incorrect.' });
      return;
    }

    user.password = new_password;
    await user.save();

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    next(error);
  }
};

// Transfer to another NileTrust account
export const transfer = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    // Idempotency: return cached result for duplicate requests
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (idempotencyKey) {
      const existing = await ProcessedRequest.findOne({ key: `transfer:${idempotencyKey}` });
      if (existing) {
        res.json(existing.result);
        return;
      }
    }

    const { recipient_id, amount, description, transaction_pin } = req.body;
    const numAmount = Number(amount);

    if (!recipient_id || !numAmount || numAmount <= 0) {
      res.status(400).json({ success: false, message: 'Valid recipient and amount are required.' });
      return;
    }

    const sender = await User.findById(req.user!._id).select('+transaction_pin');
    if (!sender || !sender.is_verified) {
      res.status(403).json({
        success: false,
        code: 'UNVERIFIED',
        message: 'Your account verification is pending. Transfers are available once your identity has been verified.',
      });
      return;
    }

    if (sender.transaction_pin) {
      if (!transaction_pin) {
        res.status(400).json({ success: false, code: 'PIN_REQUIRED', message: 'Transaction PIN is required.' });
        return;
      }
      const pinMatch = await checkPin(String(transaction_pin), sender.transaction_pin);
      if (!pinMatch) {
        res.status(400).json({ success: false, code: 'INVALID_PIN', message: 'Invalid transaction PIN.' });
        return;
      }
    }

    // Resolve recipient before opening the transaction
    let recipientAccount: any;
    let recipientUser: any;

    if (String(recipient_id).includes('@')) {
      recipientUser = await User.findOne({ email: String(recipient_id).toLowerCase().trim() });
      if (!recipientUser) {
        res.status(404).json({ success: false, message: 'Recipient not found.' });
        return;
      }
      recipientAccount = await Account.findOne({ user_id: recipientUser._id });
    } else {
      recipientAccount = await Account.findOne({ account_number: recipient_id });
      if (!recipientAccount) {
        res.status(404).json({ success: false, message: 'Recipient account not found.' });
        return;
      }
      recipientUser = await User.findById(recipientAccount.user_id);
    }

    if (!recipientAccount || !recipientUser) {
      res.status(404).json({ success: false, message: 'Recipient not found.' });
      return;
    }

    if (!recipientUser.is_active) {
      res.status(400).json({ success: false, message: 'Recipient account is not active.' });
      return;
    }

    const senderAccountSnapshot = await Account.findOne({ user_id: req.user!._id });
    if (!senderAccountSnapshot) {
      res.status(404).json({ success: false, message: 'Sender account not found.' });
      return;
    }

    if (senderAccountSnapshot.account_number === recipientAccount.account_number) {
      res.status(400).json({ success: false, message: 'Cannot transfer to your own account.' });
      return;
    }

    const desc = description?.trim() || 'Transfer';
    const senderAccountNumber = senderAccountSnapshot.account_number;

    let senderTxn: any;
    let finalSenderBalance: number = 0;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Atomic debit — only proceeds if sender has sufficient funds
        const updatedSender = await Account.findOneAndUpdate(
          { user_id: req.user!._id, balance: { $gte: numAmount } },
          { $inc: { balance: -numAmount }, $set: { updated_at: new Date() } },
          { new: true, session },
        );
        if (!updatedSender) throw new Error('INSUFFICIENT_BALANCE');

        finalSenderBalance = updatedSender.balance;

        // Atomic credit
        const updatedRecipient = await Account.findOneAndUpdate(
          { _id: recipientAccount._id },
          { $inc: { balance: numAmount }, $set: { updated_at: new Date() } },
          { new: true, session },
        );
        if (!updatedRecipient) throw new Error('RECIPIENT_ACCOUNT_ERROR');

        const [debitTxn] = await Transaction.create(
          [
            {
              account_id: updatedSender._id,
              type: 'debit',
              amount: numAmount,
              balance_after: updatedSender.balance,
              description: `Transfer to ${recipientAccount.account_number} — ${desc}`,
              created_by: req.user!._id,
            },
          ],
          { session },
        );
        senderTxn = debitTxn;

        await Transaction.create(
          [
            {
              account_id: recipientAccount._id,
              type: 'credit',
              amount: numAmount,
              balance_after: updatedRecipient.balance,
              description: `Transfer from ${senderAccountNumber} — ${desc}`,
              created_by: req.user!._id,
            },
          ],
          { session },
        );
      });
    } catch (err: any) {
      if (err.message === 'INSUFFICIENT_BALANCE') {
        res.status(400).json({ success: false, message: 'Insufficient balance.' });
        return;
      }
      if (err.message === 'RECIPIENT_ACCOUNT_ERROR') {
        res.status(400).json({ success: false, message: 'Recipient account error. Please try again.' });
        return;
      }
      throw err;
    } finally {
      await session.endSession();
    }

    sendEmail({
      email: recipientUser.email,
      subject: 'NileTrust Bank - Funds Received',
      message: `Hello ${recipientUser.full_name},\n\nYou have just received a transfer of ${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} from ${sender.full_name}.\n\nDescription: ${desc}\n\nThank you for choosing NileTrust Bank!`,
    }).catch(err => console.error('Failed to send receipt email:', err));

    const responseBody = {
      success: true,
      message: 'Transfer successful.',
      balance: finalSenderBalance,
      transaction: senderTxn,
      recipient_name: recipientUser.full_name,
    };

    if (idempotencyKey) {
      ProcessedRequest.create({ key: `transfer:${idempotencyKey}`, result: responseBody }).catch(() => {});
    }

    res.json(responseBody);
  } catch (error) {
    next(error);
  }
};

// Lookup account for transfer confirmation
export const lookupAccount = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const recipient_id = req.params.recipient_id as string;
    let account;
    let user;

    if (recipient_id.includes('@')) {
      user = await User.findOne({ email: recipient_id.toLowerCase().trim() });
      if (!user || !user.is_active) {
        res.status(404).json({ success: false, message: 'Account not found.' });
        return;
      }
      account = await Account.findOne({ user_id: user._id });
    } else {
      account = await Account.findOne({ account_number: recipient_id });
      if (!account) {
        res.status(404).json({ success: false, message: 'Account not found.' });
        return;
      }
      user = await User.findById(account.user_id);
      if (!user || !user.is_active) {
        res.status(404).json({ success: false, message: 'Account not found.' });
        return;
      }
    }

    if (!account || !user) {
      res.status(404).json({ success: false, message: 'Account not found.' });
      return;
    }

    const nameParts = user.full_name.split(' ');
    const maskedName = nameParts
      .map((part: string) => part[0] + '*'.repeat(Math.max(part.length - 1, 0)))
      .join(' ');

    res.json({ success: true, name: maskedName, currency: account.currency });
  } catch (error) {
    next(error);
  }
};
