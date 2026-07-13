import mongoose, { Document, Schema } from 'mongoose';

export interface IProcessedRequest extends Document {
  key: string;
  result: Record<string, any>;
  created_at: Date;
}

const processedRequestSchema = new Schema<IProcessedRequest>({
  key: { type: String, required: true, unique: true, index: true },
  result: { type: Schema.Types.Mixed, required: true },
  created_at: { type: Date, default: Date.now },
});

// Auto-expire idempotency records after 24 hours
processedRequestSchema.index({ created_at: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.model<IProcessedRequest>('ProcessedRequest', processedRequestSchema);
