import { Router } from 'express';
import { body } from 'express-validator';
import protect from '../middleware/protect';
import adminOnly from '../middleware/adminOnly';
import * as ctrl from '../controllers/adminController';

const router = Router();

router.use(protect, adminOnly);

router.get('/users', ctrl.getUsers);

router.post(
  '/users',
  [
    body('full_name').trim().notEmpty().withMessage('Full name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('starting_balance').optional().isFloat({ min: 0 }),
    body('currency').optional().isLength({ min: 3, max: 3 }),
  ],
  ctrl.createUser
);

router.get('/users/:id', ctrl.getUserDetail);

router.patch(
  '/users/:id/balance',
  [
    body('new_balance').isFloat({ min: 0 }).withMessage('Valid balance is required'),
    body('reason').trim().notEmpty().withMessage('Reason is required'),
  ],
  ctrl.updateBalance
);

router.post(
  '/users/:id/transactions',
  [
    body('type').isIn(['credit', 'debit']).withMessage('Type must be credit or debit'),
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
    body('description').optional().trim(),
    body('date').optional().isISO8601(),
  ],
  ctrl.addTransaction
);

router.patch('/users/:id/verify', ctrl.toggleVerify);
router.patch('/users/:id/deactivate', ctrl.deactivateUser);
router.get('/analytics', ctrl.getAnalytics);

export default router;
