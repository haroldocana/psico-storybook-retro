// 1. ESQUEMA MASTER (Global - Controla las suscripciones)
const TenantSchema = new mongoose.Schema({
  companyName: String,
  dbName: { type: String, unique: true },
  stripeCustomerId: String,
  subscriptionStatus: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now }
});
const TenantModel = mongoose.model('Tenant', TenantSchema);

// 2. ESQUEMAS TENANT (Sin mongoose.model aquí)
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, lowercase: true },
  fullName: String,
  email: { type: String, lowercase: true },
  password: String,
  recoveryWord: String,
  career: String,
  role: { type: String, default: 'student' }, 
  aiAllowanceUSD: { type: Number, default: 2.00 },
  aiConsumptionUSD: { type: Number, default: 0 },
  pendingTokenRequest: { type: Boolean, default: false },
  storybooksCreated: { type: Number, default: 0 },
  subjects: Array
});

const DocumentSchema = new mongoose.Schema({
  docId: { type: String, unique: true, index: true },
  username: { type: String, lowercase: true, index: true },
  subjectId: { type: String, index: true },
  title: String,
  fileName: String,
  mimeType: String,
  base64Data: String,
  textContent: String,
  uploadedAt: String
});
