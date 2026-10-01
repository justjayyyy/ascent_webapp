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
  },
  // Track first login to show welcome message
  isFirstLogin: {
    type: Boolean,
    default: true
  },
  // Id of the one active login session; rotated on every sign-in (see lib/session.js)
  sessionId: {
    type: String,
    default: null
  },
  // Default workspace to load on login
  defaultWorkspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace'
  }
}, {
  timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' }
});

// Personal key for the iOS Shortcuts automation that adds Apple Pay purchases.
// Only a hash is stored; the key itself is shown once when it is created.
userSchema.add({
  shortcutTokenHash: { type: String, index: true, sparse: true },
  shortcutWorkspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', default: null },
  shortcutCreatedAt: { type: Date, default: null },
  shortcutLastUsedAt: { type: Date, default: null }
});

// Passkeys (WebAuthn): Face ID / Touch ID / fingerprint sign-in and app unlock. Only public keys are
// stored; the private half never leaves the person's device or password manager.
const passkeySchema = new mongoose.Schema({
  credentialID: { type: String, required: true }, // base64url
  publicKey: { type: String, required: true }, // base64url COSE key
  counter: { type: Number, default: 0 },
  transports: { type: [String], default: undefined },
  deviceType: { type: String, enum: ['singleDevice', 'multiDevice'], default: 'singleDevice' },
  backedUp: { type: Boolean, default: false },
  name: { type: String, default: '', maxlength: 60 },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: null }
});

userSchema.add({ passkeys: { type: [passkeySchema], default: [] } });
userSchema.index({ 'passkeys.credentialID': 1 }, { unique: true, sparse: true });

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
  delete obj.shortcutTokenHash;
  delete obj.sessionId;
  // The app only needs to know passkeys exist; details come from /api/auth/passkey?action=list
  obj.passkeyCount = Array.isArray(obj.passkeys) ? obj.passkeys.length : 0;
  delete obj.passkeys;
  return obj;
};

export default mongoose.models.User || mongoose.model('User', userSchema);

