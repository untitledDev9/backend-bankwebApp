import mongoose, { Document, Schema } from 'mongoose';

export interface ITransactionMetadata {
  bank_name?: string;
  recipient_account_number?: string;
  recipient_name?: string;
  routing_number?: string;
  swift_code?: string;
}

export interface ITransaction extends Document {
  account_id: mongoose.Types.ObjectId;
  type: 'debit' | 'credit' | 'adjustment';
  amount: number;
  balance_after: number;
  description: string;
  metadata?: ITransactionMetadata;
  created_at: Date;
  created_by: mongoose.Types.ObjectId | null;
}

const transactionSchema = new Schema<ITransaction>({
  account_id: {
    type: Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
  },
  type: {
    type: String,
    enum: ['debit', 'credit', 'adjustment'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  balance_after: {
    type: Number,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  metadata: {
    type: {
      bank_name: String,
      recipient_account_number: String,
      recipient_name: String,
      routing_number: String,
      swift_code: String,
    },
    default: undefined,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  created_by: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
});

export default mongoose.model<ITransaction>('Transaction', transactionSchema);
