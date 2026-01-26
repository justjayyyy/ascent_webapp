import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  full_name: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  // Preferences
  language: {
    type: String,
    enum: ['en', 'he', 'ru'],
    default: 'en'
  },
  currency: {
    type: String,
    default: 'USD'
  },
  theme: {
    type: String,
    enum: ['dark', 'light'],
    default: 'dark'
  },
  // Privacy & Notifications
  blurValues: {
    type: Boolean,
    default: false
  },
  priceAlerts: {
    type: Boolean,
    default: false
  },
  dailySummary: {
    type: Boolean,
    default: false
  },
  weeklyReports: {
    type: Boolean,
    default: true
  },
  emailNotifications: {
    type: Boolean,
    default: true
  },
  // OAuth fields
  googleId: {
    type: String,
    default: null
  },
  avatar: {
    type: String,
    default: null
  },
  authProvider: {
    type: String,
    enum: ['email', 'google'],
    default: 'email'
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export default mongoose.models.User || mongoose.model('User', userSchema);

