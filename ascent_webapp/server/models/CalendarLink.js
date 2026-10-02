import './limits.js';
import mongoose from 'mongoose';

// A person's Google Calendar connection: the refresh token Google gave when they connected, encrypted
// (lib/calendarTokens.js). It belongs to the account, so the calendar stays connected across sign-ins and devices.
const calendarLinkSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  refreshToken: {
    type: String,
    required: true
  },
  scope: {
    type: String,
    default: ''
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

export default mongoose.models.CalendarLink || mongoose.model('CalendarLink', calendarLinkSchema);
