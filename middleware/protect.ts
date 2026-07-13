import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import RevokedToken from '../models/RevokedToken';

export interface AuthRequest extends Request {
  user?: IUser;
}

const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      res.status(401).json({ success: false, message: 'Not authorized. Please log in.' });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: string;
      role: string;
      jti?: string;
    };

    if (decoded.jti) {
      const revoked = await RevokedToken.findOne({ jti: decoded.jti });
      if (revoked) {
        res.status(401).json({ success: false, message: 'Session has been revoked. Please log in again.' });
        return;
      }
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      res.status(401).json({ success: false, message: 'User no longer exists.' });
      return;
    }

    if (!user.is_active) {
      res.status(401).json({ success: false, message: 'Account has been deactivated.' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

export default protect;
