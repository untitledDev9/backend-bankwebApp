import mongoose, { Document, Schema } from 'mongoose';

export interface IRevokedToken extends Document {
  jti: string;
  expires_at: Date;
}

const revokedTokenSchema = new Schema<IRevokedToken>({
  jti: { type: String, required: true, unique: true, index: true },
  expires_at: { type: Date, required: true },
});

// MongoDB TTL — document is automatically deleted when expires_at is in the past
revokedTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IRevokedToken>('RevokedToken', revokedTokenSchema);
