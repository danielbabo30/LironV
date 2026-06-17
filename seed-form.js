require('dotenv').config();
const mongoose = require('mongoose');

const FormSchema = new mongoose.Schema(
  { id: String, title: String, description: String, questions: mongoose.Schema.Types.Mixed, createdAt: String, updatedAt: String },
  { strict: false }
);
const Form = mongoose.model('Form', FormSchema);

// ─── helpers ────────────────────────────────────────────────────────────────

function q(id, type, label, opts) {
  const obj = { id, type, label, required: false };
  if (opts && opts.options)     obj.options     = opts.options;
  if (opts && opts.description) obj.description = opts.description;
  return obj;
}

function pb(title, showCondition) {
  const obj = { type: 'page_break', title };
  if (showCondition) obj.showCondition = showCondition;
  return obj;
}

function personalBlock(n) {
  const p = `b${n}_`;
  return [
    q(`${p}fname`,      'text',     'שם פרטי'),
    q(`${p}lname`,      'text',     'שם משפחה'),
    q(`${p}id`,         'text',     'מספר תעודת זהות'),
    q(`${p}dob`,        'date',     'תאריך לידה'),
    q(`${p}gender`,     'radio',    'מין',                  { options: ['זכר', 'נקבה'] }),
    q(`${p}marital`,    'radio',    'מצב משפחתי',           { options: ['רווק/ה', 'נשוי/אה', 'גרוש/ה', 'אלמן/ה'] }),
    q(`${p}children`,   'text',     'מספר ילדים'),
    q(`${p}phone`,      'text',     'טלפון נייד'),
    q(`${p}email`,      'text',     'דואר אלקטרוני'),
    q(`${p}address`,    'text',     'כתובת מגורים (רחוב ומספר)'),
    q(`${p}city`,       'text',     'עיר מגורים'),
    q(`${p}zip`,        'text',     'מיקוד'),
    q(`${p}citizen`,    'radio',    'אזרחות',               { options: ['ישראלי', 'תושב קבע', 'אחר'] }),
    q(`${p}passno`,     'text',     'מספר דרכון (אם רלוונטי)'),
    q(`${p}separation`, 'radio',    'האם קיימת הפרדה רכושית?', { options: ['כן', 'לא'] }),
    q(`${p}poa`,        'radio',    'האם קיים ייפוי כוח?',  { options: ['כן', 'לא'] }),
  ];
}

function employmentBlock(n) {
  const p = `b${n}_`;
  return [
    q(`${p}employ_status`,         'radio',    'מצב תעסוקתי',                              { options: ['שכיר', 'עצמאי', 'שכיר+עצמאי', 'פנסיונר', 'לא עובד'] }),
    q(`${p}employ_type`,           'radio',    'סוג עוסק (אם עצמאי)',                       { options: ['עוסק פטור', 'עוסק מורשה', 'חברה בע"מ', 'לא רלוונטי'] }),
    q(`${p}employer`,              'text',     'שם מקום עבודה / עסק'),
    q(`${p}seniority`,             'text',     'ותק במקום עבודה הנוכחי (בשנים)'),
    q(`${p}income`,                'text',     'הכנסה חודשית נטו (₪)'),
    q(`${p}extra_income`,          'radio',    'האם יש הכנסות נוספות?',                    { options: ['כן', 'לא'] }),
    q(`${p}extra_detail`,          'textarea', 'פירוט הכנסות נוספות'),
    q(`${p}miluim`,                'radio',    'האם משרת/ת במילואים?',                     { options: ['כן', 'לא'] }),
    q(`${p}pension`,               'radio',    'האם מקבל/ת קצבה?',                         { options: ['כן', 'לא'] }),
    q(`${p}pension_amt`,           'text',     'סכום קצבה חודשי (₪)'),
    q(`${p}foreign_income`,        'radio',    'האם יש הכנסה מחו"ל?',                      { options: ['כן', 'לא'] }),
    q(`${p}alimony`,               'radio',    'האם משלם/ת מזונות?',                       { options: ['כן', 'לא'] }),
    q(`${p}alimony_amt`,           'text',     'סכום מזונות חודשי (₪)'),
    q(`${p}income_change`,         'radio',    'האם צפוי שינוי בהכנסה בשנה הקרובה?',      { options: ['כן', 'לא'] }),
    q(`${p}income_change_detail`,  'textarea', 'פירוט השינוי הצפוי'),
    q(`${p}bank`,                  'text',     'בנק וסניף עיקרי'),
    q(`${p}account`,               'text',     'מספר חשבון בנק'),
  ];
}

function loanBlock(n) {
  const p = `ln${n}_`;
  return [
    q(`${p}exists`,   'radio', `האם יש הלוואה ${n}?`, { options: ['כן', 'לא'] }),
    q(`${p}lender`,   'text',  'שם הגוף המלווה'),
    q(`${p}balance`,  'text',  'יתרת חוב (₪)'),
    q(`${p}monthly`,  'text',  'החזר חודשי (₪)'),
    q(`${p}end_date`, 'date',  'תאריך סיום ההלוואה'),
    q(`${p}purpose`,  'text',  'מטרת ההלוואה'),
  ];
}

function mortgageBlock(n) {
  const p = `mt${n}_`;
  return [
    q(`${p}exists`,   'radio', `האם יש משכנתא ${n}?`, { options: ['כן', 'לא'] }),
    q(`${p}bank`,     'text',  'בנק המשכנתא'),
    q(`${p}balance`,  'text',  'יתרת חוב (₪)'),
    q(`${p}monthly`,  'text',  'החזר חודשי (₪)'),
    q(`${p}end_date`, 'date',  'תאריך סיום המשכנתא'),
    q(`${p}address`,  'text',  'כתובת הנכס המשועבד'),
  ];
}

// ─── build questions array ───────────────────────────────────────────────────

const questions = [];

// ── Page 0 — b_count + guar_exists together ──
questions.push(q('b_count',    'radio', 'כמה לווים יש בעסקה?',   { options: ['1', '2', '3', '4'] }));
questions.push(q('guar_exists','radio', 'האם יש ערב לעסקה?',     { options: ['כן', 'לא'] }));

// ── Borrower 1 — personal → employment → documents ──
questions.push(pb('לווה 1 — פרטים אישיים'));
questions.push(...personalBlock(1));
questions.push(pb('לווה 1 — תעסוקה והכנסות'));
questions.push(...employmentBlock(1));
questions.push(pb('מסמכים — לווה 1'));
questions.push(q('doc_b1_id',     'file', 'צילום תעודת זהות — לווה 1 (כולל ספח)'));
questions.push(q('doc_b1_salary', 'file', 'תלושי שכר — לווה 1 (3 חודשים אחרונים)'));
questions.push(q('doc_b1_bank',   'file', 'דפי חשבון בנק — לווה 1 (3 חודשים אחרונים)'));

// ── Borrower 2 — personal → employment → documents (conditional) ──
questions.push(pb('לווה 2 — פרטים אישיים',   { qId: 'b_count', vals: ['2', '3', '4'] }));
questions.push(...personalBlock(2));
questions.push(pb('לווה 2 — תעסוקה והכנסות', { qId: 'b_count', vals: ['2', '3', '4'] }));
questions.push(...employmentBlock(2));
questions.push(pb('מסמכים — לווה 2',          { qId: 'b_count', vals: ['2', '3', '4'] }));
questions.push(q('doc_b2_id',     'file', 'צילום תעודת זהות — לווה 2'));
questions.push(q('doc_b2_salary', 'file', 'תלושי שכר — לווה 2'));
questions.push(q('doc_b2_bank',   'file', 'דפי חשבון בנק — לווה 2'));

// ── Borrower 3 — personal → employment → documents (conditional) ──
questions.push(pb('לווה 3 — פרטים אישיים',   { qId: 'b_count', vals: ['3', '4'] }));
questions.push(...personalBlock(3));
questions.push(pb('לווה 3 — תעסוקה והכנסות', { qId: 'b_count', vals: ['3', '4'] }));
questions.push(...employmentBlock(3));
questions.push(pb('מסמכים — לווה 3',          { qId: 'b_count', vals: ['3', '4'] }));
questions.push(q('doc_b3_id',     'file', 'צילום תעודת זהות — לווה 3'));
questions.push(q('doc_b3_salary', 'file', 'תלושי שכר — לווה 3'));
questions.push(q('doc_b3_bank',   'file', 'דפי חשבון בנק — לווה 3'));

// ── Borrower 4 — personal → employment → documents (conditional) ──
questions.push(pb('לווה 4 — פרטים אישיים',   { qId: 'b_count', vals: ['4'] }));
questions.push(...personalBlock(4));
questions.push(pb('לווה 4 — תעסוקה והכנסות', { qId: 'b_count', vals: ['4'] }));
questions.push(...employmentBlock(4));
questions.push(pb('מסמכים — לווה 4',          { qId: 'b_count', vals: ['4'] }));
questions.push(q('doc_b4_id',     'file', 'צילום תעודת זהות — לווה 4'));
questions.push(q('doc_b4_salary', 'file', 'תלושי שכר — לווה 4'));
questions.push(q('doc_b4_bank',   'file', 'דפי חשבון בנק — לווה 4'));

// ── Guarantor details — only if guar_exists = 'כן' ──
questions.push(pb('פרטי הערב', { qId: 'guar_exists', vals: ['כן'] }));
questions.push(q('guar_fname',    'text', 'שם פרטי של הערב'));
questions.push(q('guar_lname',    'text', 'שם משפחה של הערב'));
questions.push(q('guar_id',       'text', 'מספר תעודת זהות של הערב'));
questions.push(q('guar_phone',    'text', 'טלפון נייד של הערב'));
questions.push(q('guar_email',    'text', 'דואר אלקטרוני של הערב'));
questions.push(q('guar_relation', 'text', 'קשר ללווה'));

// ── Guarantor documents — only if guar_exists = 'כן' ──
questions.push(pb('מסמכים — ערב', { qId: 'guar_exists', vals: ['כן'] }));
questions.push(q('doc_guar_id',   'file', 'צילום תעודת זהות — ערב'));

// ── Loans — each on its own page, conditional on previous loan existing ──
questions.push(pb('הלוואות קיימות'));
questions.push(...loanBlock(1));

questions.push(pb('הלוואה 2', { qId: 'ln1_exists', vals: ['כן'] }));
questions.push(...loanBlock(2));

questions.push(pb('הלוואה 3', { qId: 'ln2_exists', vals: ['כן'] }));
questions.push(...loanBlock(3));

questions.push(pb('הלוואה 4', { qId: 'ln3_exists', vals: ['כן'] }));
questions.push(...loanBlock(4));

// ── Mortgages — each on its own page, conditional on previous mortgage existing ──
questions.push(pb('משכנתאות קיימות'));
questions.push(...mortgageBlock(1));

questions.push(pb('משכנתא 2', { qId: 'mt1_exists', vals: ['כן'] }));
questions.push(...mortgageBlock(2));

questions.push(pb('משכנתא 3', { qId: 'mt2_exists', vals: ['כן'] }));
questions.push(...mortgageBlock(3));

questions.push(q('cc_count',          'text',     'מספר כרטיסי אשראי פעילים (סה"כ לכל הלווים)'));
questions.push(q('cc_limit',          'text',     'מסגרת אשראי כוללת (₪)'));
questions.push(q('cc_balance',        'text',     'יתרת חוב בכרטיסי אשראי (₪)'));
questions.push(q('guarantee_given',   'radio',    'האם מי מהלווים ערב להלוואה של אחר?', { options: ['כן', 'לא'] }));
questions.push(q('guarantee_detail',  'textarea', 'פירוט הערבות'));
questions.push(q('balloon_loan',      'radio',    'האם קיימת הלוואת גישור/בלון?',       { options: ['כן', 'לא'] }));
questions.push(q('balloon_detail',    'textarea', 'פירוט הלוואת הגישור/בלון'));

// ── Seizures / Restrictions / Proceedings ──
questions.push(pb('עיקולים, הגבלות והליכים'));
questions.push(q('seizure',              'radio',    'האם קיימים עיקולים?',                                      { options: ['כן', 'לא'] }));
questions.push(q('seizure_detail',       'textarea', 'פירוט העיקולים'));
questions.push(q('bank_restrict',        'radio',    'האם קיימות הגבלות בנקאיות?',                               { options: ['כן', 'לא'] }));
questions.push(q('bank_restrict_detail', 'textarea', 'פירוט ההגבלות'));
questions.push(q('insolvency',           'radio',    'האם הוגשה בקשה לפשיטת רגל / חדלות פירעון?',               { options: ['כן', 'לא'] }));
questions.push(q('enforcement',          'radio',    'האם קיימים הליכי הוצאה לפועל?',                            { options: ['כן', 'לא'] }));
questions.push(q('enforcement_detail',   'textarea', 'פירוט הליכי ההוצאה לפועל'));
questions.push(q('debt_arrange',         'radio',    'האם קיים הסדר חוב פעיל?',                                  { options: ['כן', 'לא'] }));
questions.push(q('debt_arrange_detail',  'textarea', 'פירוט הסדר החוב'));
questions.push(q('bounced_checks',       'radio',    "האם היו צ'קים חוזרים ב-12 חודשים האחרונים?",              { options: ['כן', 'לא'] }));
questions.push(q('credit_denied',        'radio',    'האם נדחתה בקשת אשראי ב-12 חודשים האחרונים?',              { options: ['כן', 'לא'] }));
questions.push(q('legal_proc',           'radio',    'האם קיימים הליכים משפטיים פעילים?',                        { options: ['כן', 'לא'] }));
questions.push(q('legal_proc_detail',    'textarea', 'פירוט ההליכים המשפטיים'));

// ── Final documents & declaration ──
questions.push(pb('מסמכים והצהרה'));
questions.push(q('doc_extra',    'file',     'מסמכים נוספים (אם יש)'));
questions.push(q('declaration',  'checkbox', 'אני מצהיר/ה כי כל הפרטים שמסרתי הם נכונים ומלאים לפי מיטב ידיעתי, וכי לא הסתרתי כל מידע רלוונטי'));

// ─── seed ────────────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  console.log(`Total items in questions array: ${questions.length}`);

  const now = new Date().toISOString();
  const formDoc = {
    id: 'e566c32e',
    title: 'שאלון פרטים אישיים',
    description: 'שלבים 1–3 — פרטים אישיים, משפחתיים ומגורים',
    questions,
    createdAt: now,
    updatedAt: now,
  };

  await Form.findOneAndReplace({ id: 'e566c32e' }, formDoc, { upsert: true });
  console.log(`Form e566c32e seeded successfully (${questions.length} items including page_breaks).`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
