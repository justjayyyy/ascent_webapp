import mongoose from 'mongoose';

// One row per browser/phone that agreed to receive push notifications for a user.
const pushSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  endpoint: {
    type: String,
    required: true,
    unique: true
  },
  p256dh: {
    type: String,
    required: true
  },
  auth: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    default: '',
    maxlength: 300
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

export default mongoose.models.PushSubscription || mongoose.model('PushSubscription', pushSubscriptionSchema);
