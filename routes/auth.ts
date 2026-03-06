import { Router } from 'express';
import { body } from 'express-validator';
import { authLimiter } from '../middleware/rateLimiter';
import protect from '../middleware/protect';
import * as ctrl from '../controllers/authController';

const router = Router();

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

router.post('/login', authLimiter, loginValidation, ctrl.login);
router.post('/verify-otp', authLimiter, ctrl.verifyOtp);
router.post('/admin/login', authLimiter, loginValidation, ctrl.adminLogin);
router.post('/logout', ctrl.logout);
router.get('/me', protect, ctrl.getMe);
router.post('/forgot-password', authLimiter, body('email').isEmail(), ctrl.forgotPassword);
router.post('/reset-password/:token', body('password').isLength({ min: 8 }), ctrl.resetPassword);

export default router;
