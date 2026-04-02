import mongoose, { Document, Schema } from 'mongoose';

export interface IChatMessage {
  sender: 'customer' | 'ai' | 'admin';
  text: string;
  created_at: Date;
}

export interface IChat extends Document {
  customer_id: mongoose.Types.ObjectId;
  customer_name: string;
  status: 'ai' | 'admin' | 'closed';
  admin_id: mongoose.Types.ObjectId | null;
  messages: IChatMessage[];
  created_at: Date;
  updated_at: Date;
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    sender: { type: String, enum: ['customer', 'ai', 'admin'], required: true },
    text: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const chatSchema = new Schema<IChat>({
  customer_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  customer_name: { type: String, required: true },
  status: { type: String, enum: ['ai', 'admin', 'closed'], default: 'ai' },
  admin_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  messages: [chatMessageSchema],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

chatSchema.pre('save', function () {
  this.updated_at = new Date();
});

export default mongoose.model<IChat>('Chat', chatSchema);
