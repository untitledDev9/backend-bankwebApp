import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
  role: 'customer' | 'admin';
  is_verified: boolean;
  is_active: boolean;
  verified_at: Date | null;
  verified_by: mongoose.Types.ObjectId | null;
  login_attempts: number;
  lock_until: Date | null;
  reset_token?: string;
  reset_token_expiry?: Date;
  created_at: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  isLocked(): boolean;
}

const userSchema = new Schema<IUser>({
  full_name: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8,
    select: false,
  },
  phone: {
    type: String,
    trim: true,
  },
  role: {
    type: String,
    enum: ['customer', 'admin'],
    default: 'customer',
  },
  is_verified: {
    type: Boolean,
    default: false,
  },
  is_active: {
    type: Boolean,
    default: true,
  },
  verified_at: {
    type: Date,
    default: null,
  },
  verified_by: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  login_attempts: {
    type: Number,
    default: 0,
  },
  lock_until: {
    type: Date,
    default: null,
  },
  reset_token: {
    type: String,
    select: false,
  },
  reset_token_expiry: {
    type: Date,
    select: false,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isLocked = function (): boolean {
  return !!(this.lock_until && this.lock_until > new Date());
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.reset_token;
  delete obj.reset_token_expiry;
  return obj;
};

export default mongoose.model<IUser>('User', userSchema);
