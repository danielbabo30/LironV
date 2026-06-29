require('dotenv').config();
const express    = require('express');
const multer     = require('multer');
const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const mongoose   = require('mongoose');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

const app  = express();
const PORT = 3000;
const UPLOADS_DIR    = path.join(__dirname, 'uploads');
const EMAIL_CFG_FILE = path.join(__dirname, 'email-config.json');

/* ── MongoDB connection ── */
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/liron';
let _mongoReady = false;
function connectMongo() {
  if (_mongoReady || mongoose.connection.readyState !== 0) return;
  mongoose.connect(MONGO_URI)
    .then(() => { _mongoReady = true; console.log('✓  MongoDB connected'); })
    .catch(e  => console.error('✗  MongoDB connection failed:', e.message));
}
connectMongo();

/* ── Seed superadmin on first run ── */
async function seedSuperAdmin() {
  try {
    const SA_EMAIL    = process.env.SA_EMAIL    || 'admin@system.local';
    const SA_PASSWORD = process.env.SA_PASSWORD || 'Admin1234!';
    const existing = await User.findOne({ role: 'superadmin' });
    if (!existing) {
      const passwordHash = await bcrypt.hash(SA_PASSWORD, 12);
      await User.create({
        id: 'superadmin',
        tenantId: '__system__',
        email: SA_EMAIL,
        passwordHash,
        role: 'superadmin',
        name: 'Super Admin',
        createdAt: new Date().toISOString(),
      });
      console.log(`✓  Superadmin seeded: ${SA_EMAIL} / ${SA_PASSWORD}`);
    }
  } catch (e) { console.error('seed error:', e.message); }
}
mongoose.connection.once('open', seedSuperAdmin);

/* ── Admin auth (legacy token — kept for backward-compat during migration) ── */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

/* ── JWT auth middleware ── */
function requireAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : req.cookies?.token || '';
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ ok: false, error: 'Token invalid or expired' });
  }
}

function requireSuperAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ ok: false, error: 'Forbidden' });
    next();
  });
}

function requireAdmin(req, res, next) {
  // Accept JWT (new) or legacy x-admin-token (old admin.html)
  const auth = req.headers['authorization'] || '';
  const jwtToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (jwtToken) {
    try {
      req.user = jwt.verify(jwtToken, JWT_SECRET);
      if (req.user.role === 'admin' || req.user.role === 'superadmin') return next();
    } catch {}
  }
  // Legacy token fallback
  if (ADMIN_TOKEN) {
    const header = req.headers['x-admin-token'] || '';
    if (header.length > 0) {
      const provided = Buffer.from(header.padEnd(ADMIN_TOKEN.length));
      const expected  = Buffer.from(ADMIN_TOKEN);
      if (provided.length === expected.length && crypto.timingSafeEqual(provided, expected)) {
        req.user = { role: 'admin', tenantId: 'default' };
        return next();
      }
    }
  }
  res.status(401).json({ ok: false, error: 'Unauthorized' });
}

/* ── Schemas ── */
const TenantSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  name:      { type: String, required: true },
  active:    { type: Boolean, default: true },
  createdAt: { type: String },
}, { strict: true });

const UserSchema = new mongoose.Schema({
  id:           { type: String, required: true, unique: true },
  tenantId:     { type: String, required: true, index: true },
  email:        { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role:         { type: String, enum: ['superadmin', 'admin'], default: 'admin' },
  name:         { type: String, default: '' },
  createdAt:    { type: String },
}, { strict: true });

const ContentSchema = new mongoose.Schema({ _id: String, data: mongoose.Schema.Types.Mixed });
const FormSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  title:       { type: String, default: 'טופס חדש' },
  description: { type: String, default: '' },
  questions:   { type: Array,  default: [] },
  createdAt:   { type: String },
  updatedAt:   { type: String },
}, { strict: true });
const SubmissionSchema = new mongoose.Schema({
  id:                  { type: String, required: true, unique: true },
  formId:              { type: String, required: true, index: true },
  submittedAt:         { type: String },
  answers:             { type: mongoose.Schema.Types.Mixed, default: {} },
  linkedLeadId:        { type: String, index: true },   // set on form submissions sent via lead link
  linkSentAt:          { type: String },
  linkSentFormId:      { type: String },
  responseReceivedAt:  { type: String },
  subStatus:           { type: String, default: 'נשלח' },
});

const SubSessionSchema = new mongoose.Schema({
  token:       { type: String, required: true, unique: true, index: true },
  mainToken:   { type: String, required: true, index: true },
  borrowerNum: { type: Number, required: true },  // 2, 3, or 4
  formId:      { type: String, required: true },
  status:      { type: String, default: 'pending' },  // 'pending' | 'complete'
  answers:     { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt:   { type: String },
}, { strict: true });

const PrefillSchema = new mongoose.Schema({
  token:     { type: String, required: true, unique: true, index: true },
  answers:   { type: mongoose.Schema.Types.Mixed, default: {} },
  leadId:    { type: String },
  createdAt: { type: Date, default: Date.now, expires: 7 * 24 * 3600 },
});

const Tenant     = mongoose.model('Tenant',     TenantSchema);
const User       = mongoose.model('User',       UserSchema);
const Content    = mongoose.model('Content',    ContentSchema);
const Form       = mongoose.model('Form',       FormSchema);
const Submission = mongoose.model('Submission', SubmissionSchema);
const Prefill    = mongoose.model('Prefill',    PrefillSchema);
const SubSession = mongoose.model('SubSession', SubSessionSchema);

/* ── helpers ── */
function genId() { return crypto.randomBytes(4).toString('hex'); }

try { if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR); } catch(e) { console.warn('uploads dir not writable (serverless env)'); }

// FIX: derive extension from MIME type, never from user-supplied filename
const PHOTO_MIME_EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png',
  'image/webp': '.webp', 'image/gif': '.gif'
};
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => {
    const ext = PHOTO_MIME_EXT[file.mimetype] || '.bin';
    cb(null, `photo_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (PHOTO_MIME_EXT[file.mimetype]) cb(null, true);
    else cb(new Error('Only image files are allowed (JPEG, PNG, WebP, GIF)'));
  }
});

/* multer for form file-upload questions — memory storage (works in serverless) */
const ALLOWED_FORM_MIMES = ['application/pdf','image/png','image/jpeg','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const formFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_FORM_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('סוג קובץ לא מורשה'));
  }
});

/* ── Security headers (Medium #11) ── */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.tailwindcss.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "blob:", "https://lh3.googleusercontent.com", "https://images.unsplash.com"],
      connectSrc: ["'self'"],
    }
  },
  crossOriginEmbedderPolicy: false,   // allow loading fonts/images cross-origin
}));

app.use(express.json({ limit: '2mb' }));

/* ── Rate limiting (Medium #12) ── */
const publicSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 min window
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
  message: { ok: false, error: 'Too many requests — please try again later' }
});
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

/* ── Static files: serve ONLY the two HTML pages + uploads ──
   FIX (Critical #1): remove express.static(__dirname) which exposed
   .env, email-config.json, server.js, package.json, etc.         ── */
app.get('/',              (req, res) => res.sendFile(path.join(__dirname, 'landing2.html')));
app.get('/admin.html',    (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/super-admin',   (req, res) => res.sendFile(path.join(__dirname, 'super-admin.html')));
// Serve uploaded files; dotfiles are denied by default in serve-static
app.use('/uploads', express.static(UPLOADS_DIR, { dotfiles: 'deny' }));
app.use('/public', express.static(path.join(__dirname, 'public'), { dotfiles: 'deny' }));

/* Explicitly block direct access to sensitive files */
const SENSITIVE = /\.(env|json|js|log|md|gitignore|lock)$/i;
app.get(SENSITIVE, (req, res) => res.status(403).end());

/* ═══════════════════ AUTH API ═══════════════════ */

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

/* POST /api/auth/login */
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    connectMongo();
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ ok: false, error: 'חסרים פרטים' });
    const user = await User.findOne({ email: email.toLowerCase().trim() }).lean();
    if (!user) return res.status(401).json({ ok: false, error: 'אימייל או סיסמה שגויים' });
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ ok: false, error: 'אימייל או סיסמה שגויים' });
    const tenant = user.role !== 'superadmin'
      ? await Tenant.findOne({ id: user.tenantId }).lean()
      : null;
    if (user.role !== 'superadmin' && (!tenant || !tenant.active))
      return res.status(403).json({ ok: false, error: 'החשבון אינו פעיל' });
    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenantId, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ ok: true, token, role: user.role, name: user.name, tenantId: user.tenantId });
  } catch (e) { console.error('[auth/login]', e.message); res.status(500).json({ ok: false, error: 'שגיאה פנימית' }); }
});

/* GET /api/auth/me */
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

/* ═══════════════════ SUPER-ADMIN API ═══════════════════ */

/* GET /api/sa/tenants */
app.get('/api/sa/tenants', adminLimiter, requireSuperAdmin, async (req, res) => {
  try {
    const tenants = await Tenant.find({}, { _id: 0, __v: 0 }).lean();
    // attach user count per tenant
    const counts = await User.aggregate([
      { $group: { _id: '$tenantId', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[c._id] = c.count; });
    res.json({ ok: true, tenants: tenants.map(t => ({ ...t, userCount: countMap[t.id] || 0 })) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* POST /api/sa/tenants */
app.post('/api/sa/tenants', adminLimiter, requireSuperAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 2) return res.status(400).json({ ok: false, error: 'שם חסר' });
    const tenant = { id: genId(), name: name.trim(), active: true, createdAt: new Date().toISOString() };
    await Tenant.create(tenant);
    res.json({ ok: true, tenant });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* PATCH /api/sa/tenants/:id */
app.patch('/api/sa/tenants/:id', adminLimiter, requireSuperAdmin, async (req, res) => {
  try {
    const { name, active } = req.body;
    const update = {};
    if (typeof name === 'string') update.name = name.trim();
    if (typeof active === 'boolean') update.active = active;
    const t = await Tenant.findOneAndUpdate({ id: req.params.id }, { $set: update }, { new: true, lean: true });
    if (!t) return res.status(404).json({ ok: false, error: 'לא נמצא' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* DELETE /api/sa/tenants/:id */
app.delete('/api/sa/tenants/:id', adminLimiter, requireSuperAdmin, async (req, res) => {
  try {
    await Tenant.deleteOne({ id: req.params.id });
    await User.deleteMany({ tenantId: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* GET /api/sa/users */
app.get('/api/sa/users', adminLimiter, requireSuperAdmin, async (req, res) => {
  try {
    const users = await User.find({}, { _id: 0, __v: 0, passwordHash: 0 }).lean();
    res.json({ ok: true, users });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* POST /api/sa/users */
app.post('/api/sa/users', adminLimiter, requireSuperAdmin, async (req, res) => {
  try {
    const { tenantId, email, password, name, role } = req.body;
    if (!tenantId || !email || !password)
      return res.status(400).json({ ok: false, error: 'חסרים שדות חובה' });
    if (password.length < 8) return res.status(400).json({ ok: false, error: 'סיסמה קצרה מדי (מינימום 8 תווים)' });
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ ok: false, error: 'אימייל כבר קיים' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = {
      id: genId() + genId(),
      tenantId,
      email: email.toLowerCase().trim(),
      passwordHash,
      name: name || '',
      role: role === 'superadmin' ? 'superadmin' : 'admin',
      createdAt: new Date().toISOString(),
    };
    await User.create(user);
    const { passwordHash: _, ...safe } = user;
    res.json({ ok: true, user: safe });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* PATCH /api/sa/users/:id — update password or name */
app.patch('/api/sa/users/:id', adminLimiter, requireSuperAdmin, async (req, res) => {
  try {
    const { name, password, active } = req.body;
    const update = {};
    if (typeof name === 'string') update.name = name.trim();
    if (typeof password === 'string' && password.length >= 8)
      update.passwordHash = await bcrypt.hash(password, 12);
    const u = await User.findOneAndUpdate({ id: req.params.id }, { $set: update }, { new: true, lean: true });
    if (!u) return res.status(404).json({ ok: false, error: 'לא נמצא' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* DELETE /api/sa/users/:id */
app.delete('/api/sa/users/:id', adminLimiter, requireSuperAdmin, async (req, res) => {
  try {
    const result = await User.deleteOne({ id: req.params.id });
    if (!result.deletedCount) return res.status(404).json({ ok: false, error: 'לא נמצא' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* ═══════════════════ CONTENT API ═══════════════════ */

app.get('/api/content', async (req, res) => {  // public read — site branding only
  try {
    connectMongo();
    const doc = await Content.findById('main').lean();
    if (!doc) {
      // seed from file if DB is empty and file exists
      try {
        const file = path.join(__dirname, 'content.json');
        if (fs.existsSync(file)) {
          const data = JSON.parse(fs.readFileSync(file, 'utf8'));
          try { await Content.create({ _id: 'main', data }); } catch {}
          return res.json(data);
        }
      } catch {}
      return res.json({});
    }
    res.json(doc.data);
  } catch (e) {
    console.error("[api/content]", e.message);
    // return empty object so client doesn't crash — client must handle missing fields
    res.json({});
  }
});

app.post('/api/content', adminLimiter, requireAdmin, async (req, res) => {
  try {
    await Content.findByIdAndUpdate('main', { data: req.body }, { upsert: true });
    res.json({ ok: true });
  } catch (e) { console.error("[API]", e.message); res.status(500).json({ ok: false, error: "Internal server error" }); }
});

app.post('/api/upload', adminLimiter, requireAdmin, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'no file' });
  res.json({ ok: true, url: `/uploads/${req.file.filename}` });
});

app.post('/api/form-upload', publicSubmitLimiter, formFileUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'no file' });
  try {
    const fileId = genId() + genId();
    await Content.findByIdAndUpdate(
      'file_' + fileId,
      { data: { buf: req.file.buffer.toString('base64'), mime: req.file.mimetype, name: Buffer.from(req.file.originalname, 'latin1').toString('utf8') } },
      { upsert: true }
    );
    res.json({ ok: true, url: `/api/files/${fileId}`, name: req.file.originalname });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* Serve uploaded files stored in MongoDB */
app.get('/api/files/:id', async (req, res) => {
  try {
    const doc = await Content.findById('file_' + req.params.id).lean();
    if (!doc || !doc.data || !doc.data.buf) return res.status(404).send('Not found');
    const buf = Buffer.from(doc.data.buf, 'base64');
    res.set('Content-Type', doc.data.mime || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${encodeURIComponent(doc.data.name || 'file')}"`);
    res.send(buf);
  } catch(e) { res.status(500).send('Error'); }
});

/* ═══════════════════ FORMS API ═══════════════════ */

/* GET all forms */
app.get('/api/forms', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const forms = await Form.find({}, { _id: 0 }).lean();
    // seed from file on first run
    if (forms.length === 0) {
      const file = path.join(__dirname, 'forms.json');
      if (fs.existsSync(file)) {
        const { forms: fileForms } = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (fileForms?.length) {
          await Form.insertMany(fileForms.map(f => ({ ...f })));
          return res.json({ forms: fileForms });
        }
      }
    }
    res.json({ forms });
  } catch (e) { console.error("[API]", e.message); res.status(500).json({ ok: false, error: "Internal server error" }); }
});

/* CREATE form */
app.post('/api/forms', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const form = {
      id:          genId(),
      title:       req.body.title       || 'טופס חדש',
      description: req.body.description || '',
      questions:   req.body.questions   || [],
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    };
    await Form.create(form);
    res.json({ ok: true, form });
  } catch (e) { console.error("[API]", e.message); res.status(500).json({ ok: false, error: "Internal server error" }); }
});

/* UPDATE form */
app.put('/api/forms/:id', adminLimiter, requireAdmin, async (req, res) => {
  try {
    // FIX (High #7): allowlist only known fields — never spread entire req.body into Mongoose
    const { title, description, questions } = req.body;
    const update = {
      title:       typeof title       === 'string' ? title.slice(0, 500)   : undefined,
      description: typeof description === 'string' ? description.slice(0, 2000) : undefined,
      questions:   Array.isArray(questions)         ? questions             : undefined,
      updatedAt:   new Date().toISOString(),
    };
    // remove undefined keys
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);
    const form = await Form.findOneAndUpdate(
      { id: req.params.id }, { $set: update }, { new: true, lean: true });
    if (!form) return res.status(404).json({ ok: false, error: 'not found' });
    const { _id, __v, ...clean } = form;
    res.json({ ok: true, form: clean });
  } catch (e) { console.error("[API]", e.message); res.status(500).json({ ok: false, error: "Internal server error" }); }
});

/* DELETE form */
app.delete('/api/forms/:id', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const result = await Form.deleteOne({ id: req.params.id });
    if (!result.deletedCount) return res.status(404).json({ ok: false, error: 'not found' });
    await Submission.deleteMany({ formId: req.params.id });
    res.json({ ok: true });
  } catch (e) { console.error("[API]", e.message); res.status(500).json({ ok: false, error: "Internal server error" }); }
});

/* ═══════════════════ SUBMISSIONS API ═══════════════════ */

/* Submit form */
app.post('/api/submit/:id', publicSubmitLimiter, async (req, res) => {
  try {
    const form = await Form.findOne({ id: req.params.id }).lean();
    if (!form) return res.status(404).json({ ok: false, error: 'form not found' });
    const newId = genId();
    const subDoc = {
      id:          newId,
      formId:      req.params.id,
      submittedAt: new Date().toISOString(),
      answers:     req.body.answers || {},
    };
    // If submitted via a lead link, attach to parent lead (not a standalone lead)
    if (req.body.leadId) {
      subDoc.linkedLeadId = req.body.leadId;
    }
    await Submission.create(subDoc);
    // Mark parent lead as having received a response
    if (req.body.leadId) {
      await Submission.findOneAndUpdate(
        { id: req.body.leadId },
        { responseReceivedAt: new Date().toISOString() }
      ).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) { console.error("[API]", e.message); res.status(500).json({ ok: false, error: "Internal server error" }); }
});

/* Get submissions for a form */
app.get('/api/submissions/:id', adminLimiter, requireAdmin, async (req, res) => {
  try {
    // FIX (High #5): validate ID to prevent path traversal in file seeding below
    if (!/^[a-f0-9]{1,32}$/.test(req.params.id))
      return res.status(400).json({ ok: false, error: 'invalid id' });
    const form = await Form.findOne({ id: req.params.id }, { _id: 0 }).lean();
    if (!form) return res.status(404).json({ ok: false, error: 'not found' });
    const submissions = await Submission.find({ formId: req.params.id }, { _id: 0, __v: 0 })
      .sort({ submittedAt: -1 }).lean();
    // seed from file submissions if DB is empty
    if (submissions.length === 0) {
      const file = path.join(__dirname, 'submissions', `${req.params.id}.json`);
      if (fs.existsSync(file)) {
        const { submissions: fileSubs } = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (fileSubs?.length) {
          await Submission.insertMany(fileSubs.map(s => ({ ...s, formId: req.params.id })));
          return res.json({ form, submissions: fileSubs });
        }
      }
    }
    res.json({ form, submissions });
  } catch (e) { console.error("[API]", e.message); res.status(500).json({ ok: false, error: "Internal server error" }); }
});

/* POST contact form from landing page */
app.post('/api/contact', publicSubmitLimiter, async (req, res) => {
  try {
    const { name, phone, message } = req.body;
    // FIX (Medium #14): input validation
    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.length > 100)
      return res.status(400).json({ ok: false, error: 'שם לא תקין' });
    if (!phone || typeof phone !== 'string' || !/^[0-9+\-\s()]{7,20}$/.test(phone.trim()))
      return res.status(400).json({ ok: false, error: 'מספר טלפון לא תקין' });
    if (message && (typeof message !== 'string' || message.length > 2000))
      return res.status(400).json({ ok: false, error: 'הודעה ארוכה מדי' });
    await Submission.create({
      id:          genId(),
      formId:      '__contact__',
      submittedAt: new Date().toISOString(),
      answers:     { name: name||'', phone: phone||'', message: message||'' },
    });
    res.json({ ok: true });
  } catch (e) { console.error("[API]", e.message); res.status(500).json({ ok: false, error: "Internal server error" }); }
});

/* GET leads — only contact-form + manual entries, each with linked form submissions */
app.get('/api/leads', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const [forms, leads, linkedSubs] = await Promise.all([
      Form.find({}, { _id: 0, id: 1, title: 1, questions: 1 }).lean(),
      Submission.find(
        { formId: { $in: ['__contact__', '__manual__'] } },
        { _id: 0, __v: 0 }
      ).sort({ submittedAt: -1 }).lean(),
      Submission.find(
        { linkedLeadId: { $exists: true } },
        { _id: 0, __v: 0 }
      ).sort({ submittedAt: 1 }).lean()
    ]);

    const formMap = {};
    forms.forEach(f => { formMap[f.id] = f; });

    // group linked submissions by their parent leadId
    const linkedByLead = {};
    linkedSubs.forEach(s => {
      const lid = s.linkedLeadId;
      if (!linkedByLead[lid]) linkedByLead[lid] = [];
      linkedByLead[lid].push({
        ...s,
        formTitle:     formMap[s.formId]?.title || s.formId,
        formQuestions: formMap[s.formId]?.questions || []
      });
    });

    const result = leads.map(lead => ({
      ...lead,
      formTitle:          lead.formId === '__contact__' ? 'פנייה מדף הנחיתה' : 'ליד ידני',
      formQuestions:      [],
      linkedSubmissions:  linkedByLead[lead.id] || []
    }));

    res.json({ leads: result });
  } catch (e) { console.error("[API]", e.message); res.status(500).json({ ok: false, error: "Internal server error" }); }
});

/* POST manual lead */
app.post('/api/leads/manual', adminLimiter, requireAdmin, async (req, res) => {
  try {
    await Submission.create({
      id:          genId(),
      formId:      '__manual__',
      submittedAt: new Date().toISOString(),
      answers:     req.body.answers || {},
    });
    res.json({ ok: true });
  } catch (e) { console.error("[API]", e.message); res.status(500).json({ ok: false, error: "Internal server error" }); }
});

/* PATCH mark link sent for a lead */
app.patch('/api/leads/:id/link-sent', adminLimiter, requireAdmin, async (req, res) => {
  try {
    await Submission.findOneAndUpdate(
      { id: req.params.id },
      { linkSentAt: new Date().toISOString(), linkSentFormId: req.body.formId || '' }
    );
    res.json({ ok: true });
  } catch (e) { console.error("[API]", e.message); res.status(500).json({ ok: false, error: "Internal server error" }); }
});

/* GET prefill answers by token — public */
app.get('/api/prefill/:token', async (req, res) => {
  try {
    const doc = await Prefill.findOne({ token: req.params.token }).lean();
    if (!doc) return res.status(404).json({ ok: false });
    res.json({ ok: true, answers: doc.answers });
  } catch (e) { res.status(500).json({ ok: false }); }
});

/* POST create prefill link from an existing submission */
app.post('/api/leads/:leadId/prefill-link', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const { submissionId } = req.body;
    const sub = await Submission.findOne({ id: submissionId }).lean();
    if (!sub) return res.status(404).json({ ok: false, error: 'submission not found' });
    const token = genId() + genId();
    await Prefill.create({ token, answers: sub.answers || {}, leadId: req.params.leadId });
    const url = `/form/${sub.formId}?leadId=${req.params.leadId}&prefill=${token}`;
    res.json({ ok: true, url });
  } catch (e) { console.error('[prefill]', e.message); res.status(500).json({ ok: false, error: 'server error' }); }
});

/* PATCH submission status */
const SUB_STATUSES = ['נשלח','ממתין לאישור','הוקפאה','נדחה','בוטל','אושר'];
app.patch('/api/submissions/:id/status', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    console.log('[STATUS] id:', req.params.id, '| status:', status, '| valid:', SUB_STATUSES.includes(status));
    if (!SUB_STATUSES.includes(status)) return res.status(400).json({ ok: false, error: 'invalid status: ' + status });
    const result = await Submission.findOneAndUpdate({ id: req.params.id }, { $set: { subStatus: status } });
    console.log('[STATUS] matched:', !!result);
    res.json({ ok: true });
  } catch (e) { console.error("[API]", e.message); res.status(500).json({ ok: false, error: "Internal server error" }); }
});

/* DELETE a single submission */
app.delete('/api/leads/:id', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const result = await Submission.deleteOne({ id: req.params.id });
    if (!result.deletedCount) return res.status(404).json({ ok: false, error: 'not found' });
    res.json({ ok: true });
  } catch (e) { console.error("[API]", e.message); res.status(500).json({ ok: false, error: "Internal server error" }); }
});

/* ═══════════════════ SUB-SESSION API ═══════════════════ */

/* ── sub-session: create ── */
app.post('/api/sub-session', publicSubmitLimiter, async (req, res) => {
  try {
    const { mainToken, borrowerNum, formId } = req.body;
    if (!mainToken || !borrowerNum || !formId) return res.status(400).json({ ok: false, error: 'missing fields' });
    if (!/^[a-f0-9]{1,32}$/.test(formId)) return res.status(400).json({ ok: false, error: 'invalid formId' });
    const token = require('crypto').randomBytes(20).toString('hex');
    await SubSession.create({ token, mainToken, borrowerNum: Number(borrowerNum), formId, createdAt: new Date().toISOString() });
    res.json({ ok: true, token, url: `/sub/${token}` });
  } catch(e) { console.error('[sub-session]', e.message); res.status(500).json({ ok: false, error: 'Internal server error' }); }
});

/* ── sub-session: status poll ── */
app.get('/api/sub-status/:mainToken', publicSubmitLimiter, async (req, res) => {
  try {
    const subs = await SubSession.find({ mainToken: req.params.mainToken }).lean();
    res.json({ ok: true, subs: subs.map(s => ({ borrowerNum: s.borrowerNum, status: s.status, answers: s.status === 'complete' ? s.answers : null })) });
  } catch(e) { console.error('[sub-status]', e.message); res.status(500).json({ ok: false, error: 'Internal server error' }); }
});

/* ── sub-session: sub-borrower submit ── */
app.post('/api/sub-submit/:token', publicSubmitLimiter, async (req, res) => {
  try {
    const { answers } = req.body;
    if (!answers || typeof answers !== 'object') return res.status(400).json({ ok: false, error: 'missing answers' });
    const sub = await SubSession.findOne({ token: req.params.token });
    if (!sub) return res.status(404).json({ ok: false, error: 'not found' });
    if (sub.status === 'complete') return res.json({ ok: true, alreadyDone: true });
    sub.answers = answers;
    sub.status  = 'complete';
    await sub.save();
    res.json({ ok: true });
  } catch(e) { console.error('[sub-submit]', e.message); res.status(500).json({ ok: false, error: 'Internal server error' }); }
});

/* ── sub-borrower form page ── */
app.get('/sub/:token', async (req, res) => {
  try {
    const sub = await SubSession.findOne({ token: req.params.token }).lean();
    if (!sub) return res.status(404).send('<h2 style="font-family:sans-serif;text-align:center;margin-top:100px">הקישור לא תקין</h2>');
    if (sub.status === 'complete') return res.send(`<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"/><title>תודה</title></head><body style="font-family:sans-serif;text-align:center;margin-top:100px"><h2>תודה! מילאת את הטופס בהצלחה.</h2></body></html>`);
    const form = await Form.findOne({ id: sub.formId }).lean();
    if (!form) return res.status(404).send('<h2>טופס לא נמצא</h2>');
    // redirect to the main form with sub-session params
    res.redirect(`/form/${sub.formId}?sub=${req.params.token}&bn=${sub.borrowerNum}`);
  } catch(e) { console.error('[sub-render]', e.message); res.status(500).send('Internal server error'); }
});

/* ═══════════════════ PUBLIC FORM PAGE ═══════════════════ */

app.get('/form/:id', async (req, res) => {
  const form = await Form.findOne({ id: req.params.id }, { _id: 0 }).lean();
  if (!form) return res.status(404).send('<h2 style="font-family:sans-serif;text-align:center;margin-top:100px">הטופס לא נמצא</h2>');

  // read site content for branding
  let logoText = 'ייעוץ', logoAccent = 'משכנתאות';
  try {
    const contentDoc = await Content.findById('main').lean();
    const C = contentDoc?.data || {};
    logoText   = C.nav?.logoText   || logoText;
    logoAccent = C.nav?.logoAccent || logoAccent;
  } catch {}

  // Split questions into pages by page_break items
  const allItems = form.questions || [];
  const pages = [[]];
  const pageTitles = [''];
  const pageShowConds = [null]; // showCondition per page (null = always shown)
  allItems.forEach(q => {
    if (q.type === 'page_break') {
      pages.push([]);
      pageTitles.push(q.title || '');
      pageShowConds.push(q.showCondition || null);
    } else {
      pages[pages.length - 1].push(q);
    }
  });
  // remove empty pages
  const cleanPages = pages
    .map((p, i) => ({ title: pageTitles[i], questions: p, showCondition: pageShowConds[i] || null }))
    .filter(p => p.questions.length > 0);
  // FIX (Critical #3): JSON embedded inside <script> must have </script> escaped,
  // otherwise a label containing "</script>" would break out of the script block → XSS
  const safeJson = obj => JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  const pagesJson     = safeJson(cleanPages);
  const questionsJson = safeJson(allItems.filter(q => q.type !== 'page_break'));

  res.send(`<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(form.title)} | ${esc(logoText)} ${esc(logoAccent)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&display=swap" rel="stylesheet" />
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--ocean:#1C3A4A;--gold:#C8A96E;--dg:#A07840;--cream:#F5F1EB;--sand:#E8DDD0;--green:#2E5D4B;--red:#B8624C}
    body{font-family:'Heebo',sans-serif;background:var(--cream);color:#1a2830;direction:rtl;min-height:100vh}

    /* ── nav ── */
    .nav{background:var(--cream);border-bottom:1px solid rgba(28,58,74,.1);padding:0 24px;height:60px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
    .nav-logo{font-family:'Fraunces','Frank Ruhl Libre',serif;font-size:18px;font-weight:500;color:var(--ocean);text-decoration:none}
    .nav-logo span{color:var(--gold);font-style:italic}

    /* ── progress ── */
    .progress-wrap{background:rgba(28,58,74,.06);height:5px;width:100%}
    .progress-bar{height:5px;background:linear-gradient(to left,var(--gold),var(--dg));transition:width .5s cubic-bezier(.4,0,.2,1);width:0%}
    /* page dots */
    .page-dots{display:flex;align-items:center;justify-content:center;gap:8px;padding:16px 0 4px}
    .page-dot{width:28px;height:6px;border-radius:3px;background:rgba(28,58,74,.1);transition:background .3s,width .3s}
    .page-dot.done{background:rgba(200,169,110,.5)}
    .page-dot.active{background:var(--gold);width:36px}

    /* ── page ── */
    .page{max-width:640px;margin:0 auto;padding:20px 24px 80px}
    .form-header{margin-bottom:20px;text-align:center}
    .form-badge{display:inline-block;background:rgba(200,169,110,.15);border:1px solid rgba(200,169,110,.4);border-radius:100px;padding:5px 14px;font-size:12px;font-weight:600;color:var(--dg);margin-bottom:16px}
    .form-title{font-family:'Fraunces','Frank Ruhl Libre',serif;font-size:clamp(24px,5vw,38px);font-weight:400;color:var(--ocean);margin-bottom:10px}
    .form-desc{font-size:15px;color:#5a6e7a;line-height:1.65}

    /* ── wizard step ── */
    .wizard-step{display:none}
    .wizard-step.active{display:block;animation:stepIn .3s ease both}
    .wizard-step.active.back{animation:stepInBack .3s ease both}
    @keyframes stepIn{from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:none}}
    @keyframes stepInBack{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}
    @keyframes stepOut{from{opacity:1;transform:none}to{opacity:0;transform:translateX(18px)}}

    .question-card{background:#fff;border-radius:14px;padding:32px;border:1px solid rgba(28,58,74,.07);box-shadow:0 2px 16px rgba(28,58,74,.05)}
    .q-num{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-bottom:10px}
    .q-label{font-size:19px;font-weight:600;color:var(--ocean);line-height:1.35;margin-bottom:6px}
    .q-desc{font-size:13px;color:#7a8e99;margin-bottom:16px;line-height:1.55}
    .req{color:var(--red)}

    /* ── inputs ── */
    .form-input,.form-textarea{width:100%;margin-top:14px;padding:13px 15px;border:1px solid #d8d3ca;border-radius:9px;font-family:'Heebo',sans-serif;font-size:15px;color:#1a2830;background:#faf9f6;direction:rtl;transition:border-color .2s,box-shadow .2s}
    .form-input:focus,.form-textarea:focus{outline:none;border-color:var(--gold);background:#fff;box-shadow:0 0 0 3px rgba(200,169,110,.15)}
    .form-textarea{min-height:120px;resize:vertical}
    /* ── file upload ── */
    .file-upload-wrap{margin-top:14px}
    .file-upload-label{display:flex;align-items:center;gap:10px;padding:14px 18px;border:2px dashed #d8d3ca;border-radius:10px;cursor:pointer;background:#faf9f6;transition:border-color .2s,background .2s;font-family:'Heebo',sans-serif;color:#5a7080;font-size:14px}
    .file-upload-label:hover{border-color:var(--gold);background:#fff}
    .file-upload-label input[type=file]{display:none}
    .file-upload-icon{font-size:22px}
    .file-upload-status{margin-top:8px;font-size:13px;color:#5a7080;padding:6px 10px;background:rgba(28,58,74,.06);border-radius:6px;display:none}
    .file-upload-status.ok{color:#2a7a4e;background:rgba(46,122,78,.1);display:block}
    .file-upload-status.err{color:#c0392b;background:rgba(192,57,43,.1);display:block}
    .file-upload-progress{height:3px;background:var(--gold);border-radius:2px;width:0;transition:width .3s;margin-top:4px}

    /* ── options ── */
    .options-group{display:flex;flex-direction:column;gap:10px;margin-top:16px}
    .option-label{display:flex;align-items:center;gap:13px;cursor:pointer;padding:12px 16px;border-radius:9px;border:1.5px solid #e2ddd6;transition:border-color .2s,background .2s,transform .1s;user-select:none}
    .option-label:hover{border-color:rgba(200,169,110,.6);background:rgba(200,169,110,.04);transform:translateX(-2px)}
    .option-label input{display:none}
    .option-box{width:22px;height:22px;border-radius:50%;border:2px solid #c8c0b4;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:border-color .2s,background .2s}
    .option-box--check{border-radius:6px}
    .option-check{font-size:12px;color:#fff;opacity:0;transition:opacity .15s;font-weight:700}
    .option-label:has(input[type=radio]:checked){border-color:var(--gold);background:rgba(200,169,110,.09)}
    .option-label:has(input[type=radio]:checked) .option-box{border-color:var(--gold);background:var(--gold)}
    .option-label:has(input[type=checkbox]:checked){border-color:var(--gold);background:rgba(200,169,110,.09)}
    .option-label:has(input[type=checkbox]:checked) .option-box--check{border-color:var(--gold);background:var(--gold)}
    .option-label:has(input[type=checkbox]:checked) .option-check{opacity:1}
    .option-text{font-size:15px;color:#2a3c47;font-weight:500}

    /* ── nav buttons ── */
    .step-nav{display:flex;align-items:center;justify-content:space-between;margin-top:24px;gap:12px}
    .btn-back{background:rgba(28,58,74,.07);color:var(--ocean);border:none;padding:13px 24px;border-radius:8px;font-family:'Heebo',sans-serif;font-size:15px;font-weight:600;cursor:pointer;transition:background .2s;display:flex;align-items:center;gap:6px}
    .btn-back:hover{background:rgba(28,58,74,.13)}
    .btn-back:disabled{opacity:.3;cursor:default}
    .btn-next{background:var(--ocean);color:var(--cream);border:none;padding:13px 32px;border-radius:8px;font-family:'Heebo',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:background .2s,transform .15s,box-shadow .2s;display:flex;align-items:center;gap:6px;margin-right:auto}
    .btn-next:hover{background:#2a5570;transform:translateY(-1px);box-shadow:0 6px 20px rgba(28,58,74,.2)}
    .btn-submit-final{background:var(--gold);color:var(--ocean);border:none;padding:14px 40px;border-radius:8px;font-family:'Heebo',sans-serif;font-size:16px;font-weight:700;cursor:pointer;transition:background .2s,transform .15s,box-shadow .2s;display:flex;align-items:center;gap:8px;margin-right:auto}
    .btn-submit-final:hover{background:var(--dg);color:#fff;transform:translateY(-1px);box-shadow:0 8px 24px rgba(160,120,64,.3)}

    /* ── page section title ── */
    .page-section-title{font-family:'Fraunces','Frank Ruhl Libre',serif;font-size:22px;font-weight:400;color:var(--ocean);margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid rgba(200,169,110,.25)}
    .intro-header{font-family:'Fraunces','Frank Ruhl Libre',serif;font-size:28px;font-weight:600;color:var(--ocean);text-align:center;margin-bottom:24px;}

    /* ── branch hint ── */
    .branch-hint{font-size:12px;color:rgba(200,169,110,.8);margin-top:12px;display:flex;align-items:center;gap:5px}

    /* ── success ── */
    .success-screen{display:none;text-align:center;padding:60px 0;animation:stepIn .4s ease both}
    .success-icon{font-size:72px;margin-bottom:24px}
    .success-title{font-family:'Fraunces',serif;font-size:34px;font-weight:400;color:var(--ocean);margin-bottom:12px}
    .success-sub{font-size:16px;color:#5a6e7a;line-height:1.6}
    .form-id-note{margin-top:48px;font-size:11px;color:#ccc;text-align:center}

    /* ── review screen ── */
    .review-screen{display:none;animation:stepIn .35s ease both}
    .review-section{margin-bottom:28px}
    .review-section-title{font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(200,169,110,.2)}
    .review-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid rgba(28,58,74,.06)}
    .review-row:last-child{border-bottom:none}
    .review-label{font-size:13px;color:#7a8e99;flex:0 0 44%;text-align:right}
    .review-value{font-size:14px;font-weight:500;color:var(--ocean);flex:1;text-align:right;word-break:break-word}
    .review-value.empty{color:#c0c8cc;font-style:italic}
    .review-edit-btn{background:none;border:none;cursor:pointer;color:var(--gold);font-size:13px;padding:2px 6px;border-radius:4px;flex-shrink:0;white-space:nowrap}
    .review-edit-btn:hover{background:rgba(200,169,110,.12)}
    .review-edit-wrap{display:none;margin-top:6px;width:100%}
    .review-edit-wrap.open{display:block}
    .review-edit-input{width:100%;padding:9px 12px;border:1.5px solid var(--gold);border-radius:8px;font-family:'Heebo',sans-serif;font-size:14px;direction:rtl;outline:none}
    .review-edit-save{margin-top:6px;background:var(--ocean);color:#fff;border:none;padding:7px 18px;border-radius:7px;font-family:'Heebo',sans-serif;font-size:13px;font-weight:700;cursor:pointer}
    .review-submit-bar{position:sticky;bottom:0;background:var(--cream);padding:16px 0 8px;margin-top:24px;text-align:center;border-top:1px solid rgba(28,58,74,.08)}
    .review-back-btn{background:rgba(28,58,74,.07);color:var(--ocean);border:none;padding:11px 22px;border-radius:8px;font-family:'Heebo',sans-serif;font-size:14px;font-weight:600;cursor:pointer;margin-left:12px}

    /* ── validation shake ── */
    @keyframes shake{0%,100%{transform:none}20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}
    .shake{animation:shake .35s ease}

    /* ── process tree (horizontal, above form) ── */
    .process-tree{display:none;max-width:640px;margin:0 auto 18px;direction:rtl;font-family:'Heebo',sans-serif}
    .pt-row{display:flex;align-items:flex-start;gap:0;position:relative}
    .pt-group{flex:1;display:flex;flex-direction:column;align-items:center;position:relative}
    .pt-connector{position:absolute;top:11px;left:50%;right:-50%;height:2px;background:rgba(28,58,74,.12);z-index:0;transition:background .3s}
    .pt-group:first-child .pt-connector{display:none}
    .pt-group--done .pt-connector{background:rgba(200,169,110,.5)}
    .pt-group-top{display:flex;flex-direction:column;align-items:center;gap:5px;z-index:1;width:100%}
    .pt-group-num{width:22px;height:22px;border-radius:50%;background:rgba(28,58,74,.1);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:rgba(28,58,74,.35);transition:background .3s,color .3s;position:relative;z-index:1}
    .pt-group--active .pt-group-num{background:var(--ocean);color:#fff}
    .pt-group--done .pt-group-num{background:var(--gold);color:#fff}
    .pt-group-label{font-size:11px;font-weight:700;color:rgba(28,58,74,.35);text-align:center;transition:color .3s;white-space:nowrap}
    .pt-group--active .pt-group-label,.pt-group--done .pt-group-label{color:var(--ocean)}
    .pt-steps{display:flex;flex-direction:column;align-items:center;gap:2px;margin-top:6px;width:100%}
    .pt-step{font-size:11px;color:#b0bec5;padding:3px 8px;border-radius:5px;text-align:center;transition:all .2s;white-space:nowrap}
    .pt-step--active{color:var(--ocean);font-weight:700;background:rgba(200,169,110,.12)}
    .pt-step--done{color:#7a9aaa}
  </style>
</head>
<body>
  <nav class="nav">
    <a href="/" class="nav-logo">${esc(logoText)} <span>${esc(logoAccent)}</span></a>
    <div style="display:none" id="navStepLabel"></div>
  </nav>
  <div class="progress-wrap" style="display:none"><div class="progress-bar" id="progressBar"></div></div>

  <div class="page">
    <div class="form-header">
      <div class="form-badge">טופס מקוון</div>
      <h1 class="form-title">${esc(form.title)}</h1>
      ${form.description ? `<p class="form-desc">${esc(form.description)}</p>` : ''}
    </div>
    <div class="page-dots" id="pageDots"></div>
    <div id="processTree" class="process-tree"></div>
    <div id="wizardWrap"></div>
    <div id="reviewScreen" class="review-screen"></div>

    <div class="success-screen" id="successScreen">
      <div class="success-icon">✅</div>
      <div class="success-title">הטופס נשלח בהצלחה!</div>
      <p class="success-sub">תודה רבה על פנייתך.<br>ניצור איתך קשר בהקדם האפשרי.</p>
      <button onclick="window.location.href=window.location.pathname" style="margin-top:28px;background:transparent;border:2px solid var(--gold);color:var(--ocean);padding:10px 28px;border-radius:8px;font-family:'Heebo',sans-serif;font-size:15px;font-weight:600;cursor:pointer;">← שלח פנייה נוספת</button>
    </div>
    <div class="form-id-note" style="display:none">מזהה טופס: ${form.id}

    <!-- ██ DEV-SKIP-BUTTON — remove entire block on request ██ -->
    <div id="devSkipBtn" style="position:fixed;bottom:20px;left:20px;z-index:9999;">
      <button onclick="devSkipToLoanType()" style="background:#e53935;color:#fff;border:none;border-radius:8px;padding:10px 18px;font-family:'Heebo',sans-serif;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);">
        ⚡ דלג לסוג הלוואה
      </button>
    </div>
    <!-- ██ END DEV-SKIP-BUTTON ██ --></div>
  </div>

<script>
var PAGES   = ${pagesJson};     // [{ title, questions:[...], showCondition }]
var ALL_QS  = ${questionsJson}; // flat list (no page_breaks)
var FORM_ID = '${form.id}';
// PAGE_CONDITIONS[i] = { qId, vals } — skip page i if answers[qId] not in vals
var PAGE_CONDITIONS = PAGES.map(p => p.showCondition || null);
const LEAD_ID      = new URLSearchParams(window.location.search).get('leadId') || '';
const PREFILL_TOKEN = new URLSearchParams(window.location.search).get('prefill') || '';
const answers = {};

// index all questions by id
const qById = {};
ALL_QS.forEach(q => qById[q.id] = q);

// page history for back navigation
let pageHistory = [0];  // stack of page indices visited
let currentPage = 0;    // index in PAGES[]

/* ██ DEV-SKIP-BUTTON — remove entire block on request ██ */
function devSkipToLoanType() {
  var idx = PAGES.findIndex(function(p) {
    return p.questions.some(function(q) { return q.id === 'loan_type'; });
  });
  if (idx < 0) { alert('עמוד loan_type לא נמצא'); return; }
  pageHistory = [idx];
  renderPage(idx);
}
/* ██ END DEV-SKIP-BUTTON ██ */

/* ═══ PROCESS TREE ═══ */
function classifyPageStep(pageIdx) {
  var page = PAGES[pageIdx];
  if (!page) return null;
  if (pageIdx === 0) return null; // intro page
  var title = page.title || '';
  var qIds  = page.questions.map(function(q) { return q.id; });

  // loan_type page marks the start of the "property" group
  var loanTypeIdx = PAGES.findIndex(function(p) {
    return p.questions && p.questions.some(function(q) { return q.id === 'loan_type'; });
  });

  if (loanTypeIdx >= 0 && pageIdx >= loanTypeIdx) {
    if (qIds.indexOf('loan_type') >= 0)                          return { main: 'property', sub: 'loan_type' };
    var propPat  = ['פרטי הנכס', 'הנכס הקיים', 'הנכס החדש'];
    var dealPat  = ['פרטי העסקה', 'מכירת הנכס', 'סוג המחזור', 'פרטי המשכנתא', 'פרטי ההגדלה', 'פרטי ההשקעה', 'נתוני המשכנתא', 'זכאות'];
    var equityPat= ['הון עצמי', 'גורמים מלווים'];
    if (propPat.some(function(k){ return title.indexOf(k)>=0; })) return { main: 'property', sub: 'loan_type' };
    if (equityPat.some(function(k){ return title.indexOf(k)>=0; })) return { main: 'property', sub: 'equity' };
    if (title.indexOf('מסמכים') >= 0)                            return { main: 'property', sub: 'equity' };
    if (dealPat.some(function(k){ return title.indexOf(k)>=0; })) return { main: 'property', sub: 'deal' };
    return { main: 'property', sub: 'deal' };
  }

  // Before loan_type → borrowers
  if (title.indexOf('ערב') >= 0) return { main: 'borrowers', sub: 'guarantor' };
  var liabPat = ['הלוואות', 'הלוואה', 'משכנתאות', 'משכנתא', 'עיקולים', 'מסמכים והצהרה'];
  if (liabPat.some(function(k){ return title.indexOf(k)>=0; })) return { main: 'borrowers', sub: 'liabilities' };
  return { main: 'borrowers', sub: 'personal' };
}

function renderProcessTree(pageIdx) {
  var tree = document.getElementById('processTree');
  if (!tree) return;
  if (pageIdx === 0) {
    tree.style.display = 'none';
    return;
  }

  var cur = classifyPageStep(pageIdx);
  if (!cur) { tree.style.display = 'none'; return; }

  var showGuarantor = answers['q_guar_exists'] === 'כן';

  function getStepState(groupId, stepId) {
    var foundActive = false, foundDone = false;
    for (var i = 0; i < PAGES.length; i++) {
      var c = classifyPageStep(i);
      if (!c || c.main !== groupId || c.sub !== stepId) continue;
      if (i === pageIdx) foundActive = true;
      else if (i < pageIdx) foundDone = true;
    }
    if (foundActive) return 'active';
    if (foundDone)   return 'done';
    return 'upcoming';
  }

  var groups = [
    {
      id: 'borrowers', label: 'פרטי הלווים', num: '01',
      steps: [
        { id: 'personal',    label: 'פרטים אישיים' },
        { id: 'guarantor',   label: 'פרטי ערב', hidden: !showGuarantor },
        { id: 'liabilities', label: 'התחייבויות' },
      ]
    },
    {
      id: 'property', label: 'פרטי הנכס', num: '02',
      steps: [
        { id: 'loan_type', label: 'סוג הנכס' },
        { id: 'deal',      label: 'פרטי העסקה' },
        { id: 'equity',    label: 'הון עצמי ומימון' },
      ]
    }
  ];

  var html = '<div class="pt-row">';
  groups.forEach(function(group, gi) {
    var isActive = cur.main === group.id;
    var isDone   = (group.id === 'borrowers' && cur.main === 'property');
    var cls = 'pt-group' + (isActive ? ' pt-group--active' : '') + (isDone ? ' pt-group--done' : '');
    html += '<div class="' + cls + '">';
    html += '<div class="pt-connector"></div>';
    html += '<div class="pt-group-top">';
    html += '<div class="pt-group-num">' + (isDone ? '✓' : group.num) + '</div>';
    html += '<div class="pt-group-label">' + group.label + '</div>';
    html += '</div>';
    html += '<div class="pt-steps">';
    group.steps.forEach(function(step) {
      if (step.hidden) return;
      var st = getStepState(group.id, step.id);
      var sc = 'pt-step' + (st === 'active' ? ' pt-step--active' : st === 'done' ? ' pt-step--done' : '');
      html += '<div class="' + sc + '">' + step.label + '</div>';
    });
    html += '</div></div>';
  });
  html += '</div>';

  tree.innerHTML = html;
  tree.style.display = 'block';
  var dots = document.getElementById('pageDots');
  if (dots) dots.style.display = 'none';
}

/* ═══ INIT ═══ */
function start() {
  if (!PAGES.length) { showSuccess(); return; }

  // Sub-borrower mode: only show pages for this borrower number
  if (SUB_TOKEN && SUB_BORROWER_NUM >= 2) {
    PAGES = PAGES.filter(function(p) {
      var t = p.title || '';
      return t.indexOf('לווה ' + SUB_BORROWER_NUM) !== -1;
    });
    if (!PAGES.length) { document.getElementById('wizardWrap').innerHTML = '<p style="text-align:center;padding:60px;font-family:Heebo,sans-serif">הטופס כבר מולא. תודה!</p>'; return; }
  }

  if (PREFILL_TOKEN) {
    fetch('/api/prefill/' + PREFILL_TOKEN)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.ok && d.answers) Object.assign(answers, d.answers);
      })
      .catch(function() {})
      .finally(function() {
        var loanPage = PAGES.findIndex(function(p) {
          return p.questions.some(function(q) { return q.id === 'loan_type'; });
        });
        var startPage = loanPage >= 0 ? loanPage : 0;
        pageHistory = [startPage];
        renderDots();
        renderPage(startPage);
      });
  } else {
    renderDots();
    renderPage(0);
  }
}

/* ═══ DOTS ═══ */
function renderDots() {
  const wrap = document.getElementById('pageDots');
  if (PAGES.length <= 1) { wrap.style.display='none'; return; }
  wrap.style.display = 'none'; // hidden by default; shown only on page 0 via renderProcessTree
  wrap.innerHTML = PAGES.map((_, i) =>
    \`<div class="page-dot \${i===currentPage?'active':i<currentPage?'done':''}" id="dot-\${i}"></div>\`
  ).join('');
}
function updateDots() {
  PAGES.forEach((_, i) => {
    const d = document.getElementById('dot-'+i);
    if (!d) return;
    d.className = 'page-dot ' + (i===currentPage?'active':i<currentPage?'done':'');
  });
}

/* ═══ WITHIN-PAGE BRANCH TARGETS ═══
   Build a set of question IDs that are branch targets of other questions
   on the SAME page — these start hidden and reveal on selection.
════════════════════════════════════ */
function getPageInternalTargets(pageQs) {
  // map: targetId → [sourceQId, ...]  (branch values can be string or string[])
  const targetMap = {};
  const pageIds = new Set(pageQs.map(q => q.id));
  pageQs.forEach(q => {
    if (!q.branching || !q.branches) return;
    Object.values(q.branches).forEach(raw => {
      const ids = Array.isArray(raw) ? raw : [raw];
      ids.forEach(tId => {
        if (tId && tId !== 'next' && tId !== 'end' && !tId.startsWith('page:') && pageIds.has(tId)) {
          if (!targetMap[tId]) targetMap[tId] = [];
          targetMap[tId].push(q.id);
        }
      });
    });
  });
  return targetMap; // { targetQId: [sourceQIds] }
}

function applyInitialVisibility(pageQs, targetMap) {
  Object.keys(targetMap).forEach(tId => {
    const sources = targetMap[tId];
    const shouldShow = sources.some(srcId => {
      const srcQ = qById[srcId];
      const ans = answers['q_'+srcId];
      if (!srcQ || !ans) return false;
      const selected = Array.isArray(ans) ? ans : [ans];
      return selected.some(s => {
        const t = srcQ.branches[s];
        return Array.isArray(t) ? t.includes(tId) : t === tId;
      });
    });
    const el = document.querySelector(\`[data-branch-target="\${tId}"]\`);
    if (el) el.style.display = shouldShow ? '' : 'none';
  });
}

function updateIntraPageBranches(srcQId, selectedVal, pageQs) {
  const q = qById[srcQId];
  if (!q || !q.branching || !q.branches) return;
  const pageIds = new Set(pageQs.map(pq => pq.id));

  // collect ALL targets across all branch options (flatten arrays)
  const allTargets = Object.values(q.branches).flatMap(t => Array.isArray(t) ? t : [t])
    .filter(t => t && t !== 'next' && t !== 'end' && !t.startsWith('page:') && pageIds.has(t));

  // hide all first
  allTargets.forEach(tId => {
    const el = document.querySelector(\`[data-branch-target="\${tId}"]\`);
    if (el) { el.style.display = 'none'; delete answers['q_'+tId]; }
  });

  // show the targets matching selectedVal (can be string or array)
  const target = q.branches[selectedVal];
  if (target) {
    const targets = Array.isArray(target) ? target : [target];
    targets.forEach(tId => {
      if (tId && tId !== 'next' && tId !== 'end' && !tId.startsWith('page:') && pageIds.has(tId)) {
        const el = document.querySelector(\`[data-branch-target="\${tId}"]\`);
        if (el) el.style.display = '';
      }
    });
  }
}

/* ═══ PERSONALIZE PAGE TITLES ═══ */
function resolvePageTitle(title) {
  for (var n = 1; n <= 4; n++) {
    var marker = 'לווה ' + n; // "לווה N"
    if (title.indexOf(marker) !== -1) {
      var fname = (answers['q_b' + n + '_fname'] || '').trim();
      var lname = (answers['q_b' + n + '_lname'] || '').trim();
      var name  = [fname, lname].filter(Boolean).join(' ');
      if (name) return title.split(marker).join('לווה — ' + name); // "לווה — name"
    }
  }
  return title;
}

/* ═══ RENDER PAGE ═══ */
function renderPage(pageIdx, direction) {
  currentPage = pageIdx;
  const page  = PAGES[pageIdx];
  const qs    = page.questions;
  const isLast = pageIdx === PAGES.length - 1;
  const wrap  = document.getElementById('wizardWrap');

  // count only pages whose showCondition is currently satisfied (or null)
  function visiblePages() {
    return PAGES.reduce(function(acc, _, i) {
      var cond = PAGE_CONDITIONS[i];
      if (!cond) return acc + 1;
      var saved = answers['q_' + cond.qId];
      var val   = Array.isArray(saved) ? saved[0] : saved;
      return cond.vals.includes(val) ? acc + 1 : acc;
    }, 0);
  }
  function visiblePageNum(idx) {
    var n = 0;
    for (var i = 0; i <= idx; i++) {
      var cond = PAGE_CONDITIONS[i];
      if (!cond) { n++; continue; }
      var saved = answers['q_' + cond.qId];
      var val   = Array.isArray(saved) ? saved[0] : saved;
      if (cond.vals.includes(val)) n++;
    }
    return n;
  }
  var vTotal = visiblePages();
  var vNum   = visiblePageNum(pageIdx);

  // progress bar
  document.getElementById('progressBar').style.width =
    Math.round((vNum / vTotal) * 100) + '%';
  document.getElementById('navStepLabel').textContent =
    vTotal > 1 ? \`עמוד \${vNum} מתוך \${vTotal}\` : '';

  updateDots();
  renderProcessTree(pageIdx);

  // compute internal branch targets for this page
  const internalTargets = getPageInternalTargets(qs);

  // compute cross-page conditional targets:
  // a question on this page that is the branch-target of a question on a DIFFERENT page
  // should only be visible if that condition was met
  const crossPageCond = {}; // targetQId → [{sourceQId, requiredVal}, ...]
  ALL_QS.forEach(sq => {
    if (!sq.branching || !sq.branches) return;
    const srcPage = PAGES.findIndex(p => p.questions.some(pq => pq.id === sq.id));
    Object.entries(sq.branches).forEach(([val, targetId]) => {
      // targetId can be string or array — flatten and skip non-question targets
      const ids = Array.isArray(targetId) ? targetId : [targetId];
      ids.forEach(tId => {
        if (!tId || tId === 'next' || tId === 'end' || tId.startsWith('page:')) return;
        const tgtPage = PAGES.findIndex(p => p.questions.some(pq => pq.id === tId));
        if (tgtPage >= 0 && tgtPage !== srcPage) {
          (crossPageCond[tId] = crossPageCond[tId] || []).push({sourceQId: sq.id, requiredVal: val});
        }
      });
    });
  });

  // build all question inputs for this page
  let qNum = ALL_QS.findIndex(q => q.id === qs[0]?.id) + 1;
  const questionsHtml = qs.map((q, localIdx) => {
    const savedVal = answers['q_'+q.id];
    let inputHtml = '';
    if (q.type === 'text') {
      inputHtml = \`<input type="text" data-qid="\${q.id}" class="form-input q-input" placeholder="הכנס תשובה..." value="\${esc(savedVal||'')}" \${q.required?'required':''} />\`;
    } else if (q.type === 'textarea') {
      inputHtml = \`<textarea data-qid="\${q.id}" class="form-textarea q-input" placeholder="הכנס תשובה..." \${q.required?'required':''}>\${esc(savedVal||'')}</textarea>\`;
    } else if (q.type === 'radio') {
      inputHtml = \`<div class="options-group" data-qid="\${q.id}" data-type="radio">\${(q.options||[]).map(opt=>\`
        <label class="option-label">
          <input type="radio" name="radio_\${q.id}" value="\${esc(opt)}" \${savedVal===opt?'checked':''}
            onchange="onRadioChange('\${q.id}',this.value,\${pageIdx},\${q.branching?'true':'false'})" />
          <span class="option-box"><span class="option-check">✓</span></span>
          <span class="option-text">\${esc(opt)}</span>
        </label>\`).join('')}</div>\`;
    } else if (q.type === 'checkbox') {
      const savedArr = Array.isArray(savedVal)?savedVal:(savedVal?[savedVal]:[]);
      inputHtml = \`<div class="options-group" data-qid="\${q.id}" data-type="checkbox">\${(q.options||[]).map(opt=>\`
        <label class="option-label">
          <input type="checkbox" name="check_\${q.id}" value="\${esc(opt)}" \${savedArr.includes(opt)?'checked':''}
            onchange="onCheckboxChange('\${q.id}',\${pageIdx})"/>
          <span class="option-box option-box--check"><span class="option-check">✓</span></span>
          <span class="option-text">\${esc(opt)}</span>
        </label>\`).join('')}</div>\`;
    } else if (q.type === 'file') {
      const savedFile = savedVal ? JSON.parse(savedVal) : null;
      inputHtml = \`
        <div class="file-upload-wrap" data-qid="\${q.id}">
          <label class="file-upload-label">
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onchange="onFileChange('\${q.id}',this)" />
            <span class="file-upload-icon">📎</span>
            <span class="file-upload-text">בחר קובץ (PDF, PNG, JPG, DOC עד 4MB)</span>
          </label>
          <div class="file-upload-progress" id="fp-\${q.id}"></div>
          <div class="file-upload-status \${savedFile?'ok':''}" id="fs-\${q.id}">\${savedFile?'✔ '+esc(savedFile.name):''}</div>
        </div>\`;
    } else if (q.type === 'date') {
      inputHtml = \`<input type="date" data-qid="\${q.id}" class="form-input q-input" value="\${esc(savedVal||'')}" \${q.required?'required':''} style="max-width:220px;" />\`;
    }
    const hasBranch = q.branching && q.branches && Object.keys(q.branches).length > 0;
    const isIntraTarget  = !!internalTargets[q.id];

    // cross-page: is this question only visible under a condition from another page?
    const crossConds = crossPageCond[q.id];
    const isCrossTarget = !!crossConds;
    const crossCondMet  = isCrossTarget && crossConds.some(c => {
      const saved = answers['q_'+c.sourceQId];
      return Array.isArray(saved) ? saved.includes(c.requiredVal) : saved === c.requiredVal;
    });
    const hideCross = isCrossTarget && !crossCondMet;
    // clear saved answer for hidden cross-page questions
    if (hideCross) delete answers['q_'+q.id];

    const isBranchTarget = isIntraTarget || isCrossTarget;
    const num = qNum + localIdx;
    return \`
      <div class="question-card" style="margin-bottom:14px;\${hideCross?'display:none;':''}" data-qi="\${num}"
           \${isBranchTarget ? \`data-branch-target="\${q.id}"\` : ''}>

        <div class="q-label">\${esc(q.label)}\${(q.required && !hideCross)?' <span class="req">*</span>':''}</div>
        \${q.description?\`<div class="q-desc">\${esc(q.description)}</div>\`:''}
        \${inputHtml}
      </div>\`;
  }).join('');

  const resolvedTitle = resolvePageTitle(page.title || '');
  const pageTitle = resolvedTitle ? \`<div class="page-section-title">\${esc(resolvedTitle)}</div>\` : '';
  const introHeader = pageIdx === 0 ? \`<div class="intro-header">רגע לפני שמתחילים</div>\` : '';
  const canBack   = pageHistory.length > 1;

  wrap.innerHTML = \`
    <div class="wizard-step active\${direction==='back'?' back':''}">
      \${introHeader}
      \${pageTitle}
      \${questionsHtml}
      <div class="step-nav">
        <button class="btn-back" onclick="goBack()" \${canBack?'':'disabled'}>→ חזרה</button>
        \${isLast
          ? \`<button class="btn-submit-final" onclick="showReviewScreen()">שלח טופס ✓</button>\`
          : \`<button class="btn-next" onclick="goNextPage(\${pageIdx})">הבא ←</button>\`}
      </div>
    </div>\`;

  // Apply initial within-page visibility based on already-selected answers
  applyInitialVisibility(qs, internalTargets);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ═══ COLLECT PAGE ANSWERS ═══ */
function isQVisible(qId) {
  // A question is visible unless its card has display:none
  const card = document.querySelector(\`[data-branch-target="\${qId}"]\`);
  if (!card) return true; // not a branch-target card → always visible
  return card.style.display !== 'none';
}

function collectPageAnswers(pageIdx) {
  const qs = PAGES[pageIdx].questions;
  let valid = true;
  qs.forEach(q => {
    // Skip hidden branch-target questions (they are intentionally invisible)
    if (!isQVisible(q.id)) return;

    if (q.type === 'text' || q.type === 'textarea' || q.type === 'date') {
      const el = document.querySelector(\`[data-qid="\${q.id}"].q-input\`);
      if (!el) return;
      if (q.required && !el.value.trim()) {
        el.classList.add('shake'); setTimeout(()=>el.classList.remove('shake'),400);
        valid = false; return;
      }
      answers['q_'+q.id] = el.value.trim();
    } else if (q.type === 'radio') {
      const checked = document.querySelector(\`input[name="radio_\${q.id}"]:checked\`);
      if (q.required && !checked) {
        const grp = document.querySelector(\`[data-qid="\${q.id}"].options-group\`);
        if (grp) { grp.classList.add('shake'); setTimeout(()=>grp.classList.remove('shake'),400); }
        valid = false; return;
      }
      answers['q_'+q.id] = checked ? checked.value : '';
    } else if (q.type === 'checkbox') {
      const checked = [...document.querySelectorAll(\`input[name="check_\${q.id}"]:checked\`)].map(i=>i.value);
      if (q.required && !checked.length) {
        const grp = document.querySelector(\`[data-qid="\${q.id}"].options-group\`);
        if (grp) { grp.classList.add('shake'); setTimeout(()=>grp.classList.remove('shake'),400); }
        valid = false; return;
      }
      answers['q_'+q.id] = checked;
    } else if (q.type === 'text' || q.type === 'textarea') {
      // already handled above — skip duplicate
    } else if (q.type === 'file') {
      // answer already saved in answers by onFileChange; just validate required
      if (q.required && !answers['q_'+q.id]) {
        const wrap = document.querySelector(\`.file-upload-wrap[data-qid="\${q.id}"]\`);
        if (wrap) { wrap.classList.add('shake'); setTimeout(()=>wrap.classList.remove('shake'),400); }
        valid = false;
      }
    }
  });
  return valid;
}

/* ═══ BRANCHING: find target page for a radio answer ═══ */
function getBranchTargetPage(q, answerVal) {
  if (!q.branching || !q.branches) return null;
  const target = q.branches[answerVal];
  if (!target || target === 'next') return null;
  if (target === 'end') return 'END';
  // Array targets are intra-page only — not a page jump
  if (Array.isArray(target)) return null;
  // page:N  →  jump directly to page N (1-indexed in editor, 0-indexed here)
  if (target.startsWith('page:')) {
    const pg = parseInt(target.split(':')[1], 10) - 1;
    return (pg >= 0 && pg < PAGES.length) ? pg : null;
  }
  // find which page contains the target question
  const pageIdx = PAGES.findIndex(p => p.questions.some(pq => pq.id === target));
  return pageIdx >= 0 ? pageIdx : null;
}

/* ═══ FILE UPLOAD ═══ */
async function onFileChange(qId, input) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('fs-'+qId);
  const progressEl = document.getElementById('fp-'+qId);

  // 4 MB limit check
  if (file.size > 4 * 1024 * 1024) {
    statusEl.className = 'file-upload-status err';
    statusEl.textContent = '✖ הקובץ גדול מ-4MB';
    input.value = '';
    return;
  }
  // type check
  const allowed = ['application/pdf','image/png','image/jpeg','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (!allowed.includes(file.type)) {
    statusEl.className = 'file-upload-status err';
    statusEl.textContent = '✖ סוג קובץ לא נתמך — PDF, PNG, JPG, DOC בלבד';
    input.value = '';
    return;
  }

  statusEl.className = 'file-upload-status';
  statusEl.textContent = '⏳ מעלה...';
  progressEl.style.width = '40%';

  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/form-upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    progressEl.style.width = '100%';
    setTimeout(() => { progressEl.style.width = '0'; }, 600);
    statusEl.className = 'file-upload-status ok';
    statusEl.textContent = '✔ ' + data.name;
    answers['q_'+qId] = JSON.stringify({ url: data.url, name: data.name });
  } catch(e) {
    progressEl.style.width = '0';
    statusEl.className = 'file-upload-status err';
    statusEl.textContent = '✖ שגיאה בהעלאה: ' + e.message;
  }
}

/* ═══ AUTO-ADVANCE on radio with branching ═══ */
function onRadioChange(qId, val, pageIdx, hasBranching) {
  answers['q_'+qId] = val;

  // always handle within-page show/hide for any radio that has intra-page targets
  const pageQs = PAGES[pageIdx].questions;
  updateIntraPageBranches(qId, val, pageQs);

  // Auto-advance: after branching, if all OTHER questions on the page are hidden (or there are none)
  const otherQs = pageQs.filter(q => q.id !== qId);
  if (otherQs.length === 0) {
    // Single-question page — always advance
    setTimeout(() => goNextPage(pageIdx), 350);
  } else {
    const allOthersHidden = otherQs.every(q => {
      const el = document.querySelector(\`[data-branch-target="\${q.id}"]\`);
      return el && el.style.display === 'none';
    });
    if (allOthersHidden) setTimeout(() => goNextPage(pageIdx), 350);
  }
}

/* ═══ CHECKBOX CHANGE — handle within-page branching ═══ */
function onCheckboxChange(qId, pageIdx) {
  const pageQs = PAGES[pageIdx].questions;
  const checked = [...document.querySelectorAll(\`input[name="check_\${qId}"]:checked\`)].map(i=>i.value);
  answers['q_'+qId] = checked;
  // for each checked value, apply intra-page branches
  checked.forEach(val => updateIntraPageBranches(qId, val, pageQs));
  // hide targets whose triggering option is no longer checked
  const q = qById[qId];
  if (!q || !q.branching || !q.branches) return;
  const pageIds = new Set(pageQs.map(pq => pq.id));
  Object.entries(q.branches).forEach(([optVal, tId]) => {
    const ids = Array.isArray(tId) ? tId : [tId];
    ids.forEach(id => {
      if (!id || id === 'next' || id === 'end' || id.startsWith('page:') || !pageIds.has(id)) return;
      if (!checked.includes(optVal)) {
        const el = document.querySelector(\`[data-branch-target="\${id}"]\`);
        if (el) { el.style.display = 'none'; delete answers['q_'+id]; }
      }
    });
  });
}

/* ═══ NEXT PAGE ═══ */
function goNextPage(pageIdx) {
  if (!collectPageAnswers(pageIdx)) return;

  // check if any question on this page has a branch result
  const qs = PAGES[pageIdx].questions;
  let branchTarget = null;
  for (const q of qs) {
    const ans = answers['q_'+q.id];
    if (!ans) continue;
    const t = getBranchTargetPage(q, Array.isArray(ans)?ans[0]:ans);
    if (t === 'END') { showReviewScreen(); return; }
    if (t !== null) { branchTarget = t; break; }
  }

  let nextPage = branchTarget !== null ? branchTarget : pageIdx + 1;
  // skip pages whose showCondition is not satisfied
  while (nextPage < PAGES.length) {
    const cond = PAGE_CONDITIONS[nextPage];
    if (!cond) break;
    const saved = answers['q_' + cond.qId];
    const val   = Array.isArray(saved) ? saved[0] : saved;
    if (cond.vals.includes(val)) break;
    nextPage++;
  }
  if (nextPage >= PAGES.length) { showReviewScreen(); return; }
  pageHistory.push(nextPage);

  // After page 0 (b_count selection): offer share links for all extra borrowers at once
  if (pageIdx === 0 && !SUB_TOKEN) {
    var bCount = parseInt(answers['q_b_count'] || answers['b_count'] || '1', 10);
    // find first borrower N >= 2 that hasn't had a choice yet
    for (var bn = 2; bn <= bCount; bn++) {
      if (!shareChoiceMade[bn]) {
        pageHistory.pop();
        showShareInterstitial(bn, nextPage);
        return;
      }
    }
  }

  renderPage(nextPage);
}

/* ═══ BACK ═══ */
function goBack() {
  if (pageHistory.length <= 1) return;
  // Save current page's text/textarea answers before leaving (without validation)
  const curQs = PAGES[currentPage].questions;
  curQs.forEach(q => {
    if (q.type === 'text' || q.type === 'textarea' || q.type === 'date') {
      const el = document.querySelector(\`[data-qid="\${q.id}"].q-input\`);
      if (el) answers['q_'+q.id] = el.value.trim();
    }
  });
  pageHistory.pop();
  const prev = pageHistory[pageHistory.length - 1];
  renderPage(prev, 'back');
}

/* ═══ REVIEW SCREEN ═══ */
function showReviewScreen() {
  // collect current (last) page answers first
  const lastIdx = PAGES.length - 1;
  collectPageAnswers(lastIdx);

  const container = document.getElementById('reviewScreen');
  const wizard    = document.getElementById('wizardWrap');
  wizard.style.display    = 'none';
  container.style.display = 'block';
  container.className     = 'review-screen';
  void container.offsetWidth; // reflow for animation

  // build sections — one per page that was actually visited / not skipped
  let html = '<h2 style="font-family:Fraunces,serif;font-size:24px;color:var(--ocean);margin-bottom:6px;text-align:right">סיכום הטופס</h2>';
  html += '<p style="font-size:13px;color:#8a9ba5;margin-bottom:28px;text-align:right">בדוק את הפרטים לפני השליחה. ניתן ללחוץ על עריכה לתיקון.</p>';

  PAGES.forEach(function(page, pi) {
    var cond = PAGE_CONDITIONS[pi];
    if (cond) {
      var saved = answers['q_' + cond.qId];
      var val   = Array.isArray(saved) ? saved[0] : saved;
      if (!cond.vals.includes(val)) return; // page was skipped
    }
    var rowsHtml = '';
    page.questions.forEach(function(q) {
      if (q.type === 'file') {
        var fdata = answers['q_' + q.id];
        if (!fdata) return;
        try { var f = JSON.parse(fdata); rowsHtml += reviewRow(q, f.name, false); } catch(e) {}
        return;
      }
      var ans = answers['q_' + q.id];
      var display = Array.isArray(ans) ? ans.join(', ') : (ans || '');
      rowsHtml += reviewRow(q, display, q.type !== 'file');
    });
    if (!rowsHtml) return;
    var sectionTitle = resolvePageTitle(page.title || ('עמוד ' + (pi+1)));
    html += '<div class="review-section">';
    html += '<div class="review-section-title">' + esc(sectionTitle) + '</div>';
    html += rowsHtml;
    html += '</div>';
  });

  html += '<div class="review-submit-bar">';
  html += '<button class="review-back-btn" onclick="hideReviewScreen()">← חזרה לעריכה</button>';
  html += '<button class="btn-submit-final" onclick="submitAllPages()">שלח טופס ✓</button>';
  html += '</div>';

  container.innerHTML = html;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function reviewRow(q, value, editable) {
  var empty = !value || !value.toString().trim();
  var valueHtml = '<span class="review-value' + (empty ? ' empty' : '') + '" id="rv_' + q.id + '">'
    + (empty ? '(לא מולא)' : esc(value.toString())) + '</span>';
  var editHtml = '';
  if (editable) {
    var inputHtml = '';
    if (q.type === 'radio') {
      inputHtml = (q.options || []).map(function(opt) {
        return '<label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer;direction:rtl">'
          + '<input type="radio" name="re_' + q.id + '" value="' + esc(opt) + '"'
          + (value === opt ? ' checked' : '') + ' />'
          + '<span>' + esc(opt) + '</span></label>';
      }).join('');
    } else if (q.type === 'textarea') {
      inputHtml = '<textarea class="review-edit-input" id="re_' + q.id + '" rows="3">' + esc(value) + '</textarea>';
    } else {
      inputHtml = '<input type="text" class="review-edit-input" id="re_' + q.id + '" value="' + esc(value) + '" />';
    }
    editHtml = '<div class="review-edit-wrap" id="rew_' + q.id + '">'
      + inputHtml
      + '<button class="review-edit-save" data-qid="' + q.id + '" data-qtype="' + q.type + '" onclick="saveReviewEdit(this.dataset.qid,this.dataset.qtype)">שמור</button>'
      + '</div>';
  }
  return '<div class="review-row">'
    + '<span class="review-label">' + esc(q.label || '') + '</span>'
    + '<div style="flex:1;text-align:right">' + valueHtml
    + (editable ? '<br/><button class="review-edit-btn" id="reb_' + q.id + '" data-qid="' + q.id + '" onclick="toggleReviewEdit(this.dataset.qid)">✏️ ערוך</button>' : '')
    + editHtml + '</div>'
    + '</div>';
}

function toggleReviewEdit(qId) {
  var wrap = document.getElementById('rew_' + qId);
  var btn  = document.getElementById('reb_' + qId);
  var open = wrap.classList.contains('open');
  wrap.classList.toggle('open', !open);
  btn.textContent = open ? '✏️ ערוך' : '✕ סגור';
}

function saveReviewEdit(qId, type) {
  var newVal;
  if (type === 'radio') {
    var checked = document.querySelector('input[name="re_' + qId + '"]:checked');
    newVal = checked ? checked.value : '';
  } else if (type === 'textarea' || type === 'text' || type === 'date') {
    newVal = document.getElementById('re_' + qId).value.trim();
  } else {
    newVal = '';
  }
  answers['q_' + qId] = newVal;
  var span = document.getElementById('rv_' + qId);
  if (span) {
    span.textContent = newVal || '(לא מולא)';
    span.className = 'review-value' + (newVal ? '' : ' empty');
  }
  toggleReviewEdit(qId);
}

function hideReviewScreen() {
  document.getElementById('reviewScreen').style.display = 'none';
  var wizard = document.getElementById('wizardWrap');
  wizard.style.display = '';
  // go back to last page
  renderPage(PAGES.length - 1, 'back');
}

/* ═══ SUBMIT ═══ */
async function submitAllPages() {
  if (SUB_TOKEN) {
    // sub-borrower mode: submit to sub-submit endpoint
    var btn = document.querySelector('.btn-submit-final');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ שולח...'; }
    try {
      var r = await fetch('/api/sub-submit/' + SUB_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answers })
      });
      var d = await r.json();
      if (!d.ok) throw new Error(d.error);
      var titleEl = document.getElementById('successScreen').querySelector('.success-title');
      if (titleEl) titleEl.textContent = 'תודה! הנתונים נשלחו בהצלחה.';
      showSuccess();
    } catch(e) {
      if (btn) { btn.disabled = false; btn.textContent = 'שלח טופס ✓'; }
      alert('אירעה שגיאה. נסה שוב.');
    }
    return;
  }

  if (!collectPageAnswers(currentPage)) return;
  var btn = document.querySelector('.btn-submit-final');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ שולח...'; }
  document.getElementById('progressBar').style.width = '100%';
  PAGES.forEach((_, i) => {
    const d = document.getElementById('dot-'+i);
    if (d) d.className = 'page-dot done';
  });
  try {
    const payload = { answers };
    if (LEAD_ID) payload.leadId = LEAD_ID;
    const res = await fetch('/api/submit/'+FORM_ID, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok) { showSuccess(); }
    else throw new Error(data.error);
  } catch(e) {
    if (btn) { btn.disabled=false; btn.textContent='שלח טופס ✓'; }
    alert('אירעה שגיאה. נסה שוב.');
  }
}

function showSuccess() {
  document.getElementById('wizardWrap').style.display    = 'none';
  document.getElementById('reviewScreen').style.display  = 'none';
  document.getElementById('pageDots').style.display      = 'none';
  document.getElementById('successScreen').style.display = 'block';
  document.getElementById('navStepLabel').textContent    = '';
  document.getElementById('progressBar').style.width     = '100%';
  sessionStorage.setItem('formSubmitted_' + FORM_ID, '1');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// Fix bfcache: when user presses Back and page is restored from cache,
// reload so they always get a fresh empty form
window.addEventListener('pageshow', e => {
  if (e.persisted) { window.location.reload(); }
});

/* ═══ PREFILL from URL param (?prefill=base64json) ═══ */
function applyPrefill() {
  try {
    const raw = new URLSearchParams(window.location.search).get('prefill');
    if (!raw) return;
    const map = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(raw)))));
    // map = { "שם מלא": "דניאל באבו", "טלפון": "050..." }
    ALL_QS.forEach(q => {
      const val = findPrefillValue(map, q.label);
      if (!val) return;
      answers['q_'+q.id] = val; // save to answers map for when page renders
    });
  } catch(e) { console.warn('prefill parse error', e); }
}

function findPrefillValue(map, label) {
  if (!label) return null;
  // exact match
  if (map[label] !== undefined) return map[label];
  // partial match — label contains key or key contains label
  const lLower = label.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    const kLower = k.toLowerCase();
    if (lLower.includes(kLower) || kLower.includes(lLower)) return v;
  }
  return null;
}

/* ═══ MAIN TOKEN & SUB-BORROWER MODE ═══ */
var MAIN_TOKEN = (function() {
  var k = 'mainToken_' + FORM_ID;
  var t = sessionStorage.getItem(k);
  if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem(k, t); }
  return t;
})();

// Check if this is a sub-borrower session (URL params: ?sub=TOKEN&bn=N)
var SUB_TOKEN = null, SUB_BORROWER_NUM = 0;
(function() {
  var params = new URLSearchParams(window.location.search);
  SUB_TOKEN = params.get('sub') || null;
  SUB_BORROWER_NUM = parseInt(params.get('bn') || '0', 10);
})();

// Track which borrowers have been delegated vs filled locally
var delegatedBorrowers = {};   // { 2: 'pending'|'complete', 3: ... }
var shareChoiceMade = {};      // { 2: true/false (true=share, false=local) }
var pollInterval = null;

function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(async function() {
    try {
      var r = await fetch('/api/sub-status/' + MAIN_TOKEN);
      var d = await r.json();
      if (!d.ok) return;
      d.subs.forEach(function(s) {
        if (s.status === 'complete' && delegatedBorrowers[s.borrowerNum] !== 'complete') {
          delegatedBorrowers[s.borrowerNum] = 'complete';
          // merge answers into main form
          if (s.answers) {
            Object.keys(s.answers).forEach(function(k) { answers[k] = s.answers[k]; });
          }
          showBorrowerCompletedToast(s.borrowerNum);
          updateShareStatusCards();
        }
      });
    } catch(e) {}
  }, 5000);
}

function showBorrowerCompletedToast(num) {
  var name = (answers['q_b' + num + '_fname'] || '') + ' ' + (answers['q_b' + num + '_lname'] || '');
  name = name.trim() || ('לווה ' + num);
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#2E5D4B;color:#fff;padding:14px 20px;border-radius:10px;font-family:Heebo,sans-serif;font-size:15px;z-index:9999;direction:rtl;box-shadow:0 4px 20px rgba(0,0,0,.2);animation:stepIn .3s ease';
  toast.textContent = '✓ ' + name + ' סיים/ה למלא את הנתונים';
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 5000);
}

function updateShareStatusCards() {
  Object.keys(delegatedBorrowers).forEach(function(num) {
    var card = document.getElementById('share-status-' + num);
    if (!card) return;
    if (delegatedBorrowers[num] === 'complete') {
      card.innerHTML = '<div style="color:#2E5D4B;font-size:15px;font-weight:600">✓ לווה ' + num + ' סיים למלא את הנתונים שלו</div>';
    }
  });
}

function showShareInterstitial(borrowerNum, targetPageIdx) {
  var wrap = document.getElementById('wizardWrap');
  var name = 'לווה ' + borrowerNum;
  wrap.innerHTML = \`
    <div class="wizard-step active">
      <div class="page-section-title">\${esc(name)} — איך תרצה להמשיך?</div>
      <div style="display:flex;flex-direction:column;gap:14px;margin:24px 0">
        <button class="btn-next" style="width:100%;justify-content:center" onclick="chooseLocalFill(\${borrowerNum},\${targetPageIdx})">
          ✍️ אני אמלא את הנתונים כאן
        </button>
        <button class="btn-back" style="width:100%;justify-content:center;background:rgba(200,169,110,.15);border:1px solid rgba(200,169,110,.4);color:var(--ocean)" onclick="chooseShareLink(\${borrowerNum},\${targetPageIdx},this)">
          🔗 שלח קישור ל\${esc(name)} לימלא בעצמו
        </button>
      </div>
      <div id="share-link-area-\${borrowerNum}" style="display:none;margin-top:8px"></div>
      <div class="step-nav" style="margin-top:24px">
        <button class="btn-back" onclick="goBack()">→ חזרה</button>
        <button class="btn-next" id="share-continue-\${borrowerNum}" style="display:none" onclick="nextShareOrContinue(\${borrowerNum},\${targetPageIdx})">המשך ←</button>
      </div>
    </div>\`;
}

function nextShareOrContinue(borrowerNum, targetPageIdx) {
  // check if there's another borrower to offer share to
  var bCount = parseInt(answers['q_b_count'] || answers['b_count'] || '1', 10);
  for (var bn = borrowerNum + 1; bn <= bCount; bn++) {
    if (!shareChoiceMade[bn]) {
      showShareInterstitial(bn, targetPageIdx);
      return;
    }
  }
  // all borrowers decided — continue to main flow
  pageHistory.push(targetPageIdx);
  renderPage(targetPageIdx);
}

async function chooseLocalFill(borrowerNum, targetPageIdx) {
  shareChoiceMade[borrowerNum] = 'local';
  nextShareOrContinue(borrowerNum, targetPageIdx);
}

async function chooseShareLink(borrowerNum, targetPageIdx, btn) {
  btn.disabled = true; btn.textContent = '⏳ יוצר קישור...';
  try {
    var r = await fetch('/api/sub-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mainToken: MAIN_TOKEN, borrowerNum: borrowerNum, formId: FORM_ID })
    });
    var d = await r.json();
    if (!d.ok) throw new Error(d.error);
    shareChoiceMade[borrowerNum] = 'shared';
    delegatedBorrowers[borrowerNum] = 'pending';
    var fullUrl = window.location.origin + d.url;
    var area = document.getElementById('share-link-area-' + borrowerNum);
    area.style.display = 'block';
    area.innerHTML = \`
      <div style="background:rgba(200,169,110,.1);border:1px solid rgba(200,169,110,.35);border-radius:10px;padding:16px;direction:rtl">
        <div style="font-size:13px;color:#5a6e7a;margin-bottom:8px">שלח את הקישור הבא ללווה \${borrowerNum}:</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="sub-link-\${borrowerNum}" type="text" value="\${esc(fullUrl)}" readonly
            style="flex:1;padding:9px 12px;border:1px solid #d8d3ca;border-radius:7px;font-size:13px;direction:ltr;background:#fff;outline:none"/>
          <button onclick="copySubLink(\${borrowerNum})" style="background:var(--ocean);color:#fff;border:none;padding:9px 16px;border-radius:7px;font-family:Heebo,sans-serif;font-size:13px;cursor:pointer">העתק</button>
        </div>
        <div id="share-status-\${borrowerNum}" style="margin-top:10px;font-size:13px;color:#8a9ba5">⏳ ממתין ללווה \${borrowerNum} למלא את הנתונים...</div>
      </div>\`;
    document.getElementById('share-continue-' + borrowerNum).style.display = 'flex';
    startPolling();
  } catch(e) {
    btn.disabled = false;
    btn.textContent = '🔗 שלח קישור ללווה ' + borrowerNum + ' לימלא בעצמו';
    alert('שגיאה ביצירת הקישור. נסה שוב.');
  }
}

function copySubLink(borrowerNum) {
  var inp = document.getElementById('sub-link-' + borrowerNum);
  inp.select();
  navigator.clipboard.writeText(inp.value).then(function() {
    var btn = inp.nextElementSibling;
    btn.textContent = '✓ הועתק';
    setTimeout(function() { btn.textContent = 'העתק'; }, 2000);
  });
}

function skipBorrowerPages(borrowerNum, fromPageIdx) {
  // find the next page after all borrowerNum pages
  var nextIdx = fromPageIdx;
  while (nextIdx < PAGES.length) {
    var t = PAGES[nextIdx].title || '';
    if (t.indexOf('לווה ' + borrowerNum) === -1) break;
    nextIdx++;
  }
  // apply PAGE_CONDITIONS skip logic too
  while (nextIdx < PAGES.length) {
    var cond = PAGE_CONDITIONS[nextIdx];
    if (!cond) break;
    var saved = answers['q_' + cond.qId];
    var val = Array.isArray(saved) ? saved[0] : saved;
    if (cond.vals.includes(val)) break;
    nextIdx++;
  }
  if (nextIdx >= PAGES.length) { showReviewScreen(); return; }
  pageHistory.push(nextIdx);
  renderPage(nextIdx);
}

/* ═══ INIT ═══ */
start();
</script>
</body>
</html>`);
});

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ═══════════════════ EMAIL API ═══════════════════ */

function getEmailCfg() {
  try { return JSON.parse(fs.readFileSync(EMAIL_CFG_FILE, 'utf8')); } catch { return null; }
}

/* GET email config (omit password) */
app.get('/api/email-config', adminLimiter, requireAdmin, (req, res) => {
  const cfg = getEmailCfg();
  if (!cfg) return res.json({ configured: false });
  res.json({ configured: true, host: cfg.host, port: cfg.port, user: cfg.user, fromName: cfg.fromName });
});

/* POST save email config */
app.post('/api/email-config', adminLimiter, requireAdmin, express.json(), (req, res) => {
  const { host, port, user, pass, fromName } = req.body;
  fs.writeFileSync(EMAIL_CFG_FILE, JSON.stringify({ host, port: Number(port), user, pass, fromName }, null, 2));
  res.json({ ok: true });
});

/* POST send lead email */
app.post('/api/send-lead', adminLimiter, requireAdmin, express.json(), async (req, res) => {
  try {
    const { to, formTitle, submittedAt, fields, attachments } = req.body;
    if (!to || !to.length) return res.status(400).json({ error: 'חסרות כתובות מייל' });

    const cfg = getEmailCfg();
    if (!cfg || !cfg.user || !cfg.pass)
      return res.status(400).json({ error: 'הגדרות מייל לא הוגדרו — פתח הגדרות מייל בממשק הניהול' });

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port || 587,
      secure: cfg.port == 465,
      auth: { user: cfg.user, pass: cfg.pass }
    });

    const date = new Date(submittedAt).toLocaleDateString('he-IL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    // FIX (High #6): escape all user-controlled values before embedding in HTML email
    const rows = (fields || []).map(f => `
      <tr>
        <td style="padding:9px 14px;font-weight:600;color:#1C3A4A;background:#f5f1eb;
                   border-bottom:1px solid #e8ddd0;width:40%;">${esc(f.question)}</td>
        <td style="padding:9px 14px;border-bottom:1px solid #e8ddd0;">${esc(f.answer) || '—'}</td>
      </tr>`).join('');

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;
                  direction:rtl;text-align:right;">
        <div style="background:#1C3A4A;padding:22px 24px;border-radius:10px 10px 0 0;">
          <h2 style="margin:0;color:#C8A96E;font-size:20px;">ליד חדש</h2>
          <div style="color:rgba(245,241,235,.7);font-size:13px;margin-top:4px;">${esc(formTitle)}</div>
        </div>
        <div style="background:#fff;padding:20px 24px;border:1px solid #e8ddd0;border-top:none;">
          <div style="font-size:12px;color:#aaa;margin-bottom:16px;">התקבל ב: ${esc(date)}</div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e8ddd0;border-radius:8px;overflow:hidden;">
            ${rows}
          </table>
        </div>
        <div style="background:#f5f1eb;padding:10px 24px;border-radius:0 0 10px 10px;
                    font-size:11px;color:#aaa;border:1px solid #e8ddd0;border-top:none;">
          נשלח ממערכת ניהול לירון
        </div>
      </div>`;

    // Build file attachments
    const mailAttachments = [];
    for (const a of (attachments || [])) {
      if (!a.url || !a.name) continue;
      // url is like /uploads/filename or a full path
      const filePath = path.join(__dirname, a.url.startsWith('/') ? a.url.slice(1) : a.url);
      if (require('fs').existsSync(filePath)) {
        mailAttachments.push({ filename: a.name, path: filePath });
      }
    }

    await transporter.sendMail({
      from: `"${cfg.fromName || 'מערכת לירון'}" <${cfg.user}>`,
      to: to.join(', '),
      subject: `ליד חדש — ${formTitle}`,
      html,
      attachments: mailAttachments
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('send-lead error:', e.message);
    res.status(500).json({ error: "Internal server error" }); console.error("[send-lead]", e.message);
  }
});

// Local dev: listen on port. Vercel: export the app.
if (require.main === module) {
  app.listen(PORT, () => console.log(`✓  http://localhost:${PORT}  |  admin: http://localhost:${PORT}/admin.html`));
}

module.exports = app;
