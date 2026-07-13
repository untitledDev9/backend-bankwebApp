import { Router } from 'express';
import { body } from 'express-validator';
import protect from '../middleware/protect';
import { transactionLimiter } from '../middleware/rateLimiter';
import * as ctrl from '../controllers/customerController';

const router = Router();

router.use(protect);

router.get('/me', ctrl.getMe);
router.get('/transactions', ctrl.getTransactions);
router.post(
  '/withdraw',
  transactionLimiter,
  [
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number'),
    body('bank_name').trim().notEmpty().withMessage('Bank name is required'),
    body('recipient_account_number').trim().notEmpty().withMessage('Recipient account number is required'),
    body('recipient_name').trim().notEmpty().withMessage('Recipient name is required'),
    body('routing_number').optional().trim(),
    body('swift_code').optional().trim(),
    body('description').optional().trim(),
  ],
  ctrl.withdraw
);

router.patch(
  '/profile',
  [
    body('full_name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('email').optional().isEmail().normalizeEmail().withMessage('Valid email required'),
    body('phone').optional().trim(),
  ],
  ctrl.updateProfile
);

router.post(
  '/change-password',
  [
    body('current_password').notEmpty().withMessage('Current password is required'),
    body('new_password').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  ],
  ctrl.changePassword
);

router.post(
  '/transfer',
  transactionLimiter,
  [
    body('recipient_id').trim().notEmpty().withMessage('Account number or email is required'),
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
    body('description').optional().trim(),
  ],
  ctrl.transfer
);

router.get('/lookup-account/:recipient_id', ctrl.lookupAccount);

export default router;
