require('dotenv').config();
const mongoose = require('mongoose');
const FormSchema = new mongoose.Schema({},{strict:false});
const Form = mongoose.model('Form', FormSchema);

const COND = { qId: 'loan_type', vals: ['מחזור והגדלת משכנתא'] };

const newItems = [
  // PAGE 1: פרטי הנכס
  { id:'pb_rex_prop', type:'page_break', title:'פרטי הנכס — מחזור והגדלה', showCondition: COND },
  { id:'rex_prop_type', type:'radio', label:'סוג נכס', required:false, options:['דירה','בית פרטי','דו משפחתי','קוטג\'','דירת גן','פנטהאוז','אחר'] },
  { id:'rex_prop_city', type:'text', label:'עיר', required:false },
  { id:'rex_prop_street', type:'text', label:'רחוב', required:false },
  { id:'rex_prop_house_num', type:'text', label:'מספר בית', required:false },
  { id:'rex_prop_apt_num', type:'text', label:'מספר דירה', required:false },
  { id:'rex_prop_value', type:'text', label:'שווי משוער של הנכס (₪)', required:false },
  { id:'rex_prop_appraisal', type:'radio', label:'האם בוצעה שמאות ב־12 החודשים האחרונים?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'rex_prop_appraisal_value'} },
  { id:'rex_prop_appraisal_value', type:'text', label:'שווי שמאי (₪)', required:false },
  { id:'rex_prop_rented', type:'radio', label:'האם הנכס מושכר?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'rex_prop_rent_amount'} },
  { id:'rex_prop_rent_amount', type:'text', label:'גובה שכירות חודשית (₪)', required:false },

  // PAGE 2: פרטי המשכנתא הקיימת
  { id:'pb_rex_mt', type:'page_break', title:'פרטי המשכנתא הקיימת — מחזור והגדלה', showCondition: COND },
  { id:'rex_mt_bank', type:'text', label:'בנק נוכחי', required:false },
  { id:'rex_mt_balance', type:'text', label:'יתרת משכנתא לסילוק (₪)', required:false },
  { id:'rex_mt_monthly', type:'text', label:'החזר חודשי נוכחי (₪)', required:false },
  { id:'rex_mt_borrowers', type:'radio', label:'מספר לווים במשכנתא', required:false, options:['1','2','3+'] },
  { id:'rex_mt_multi', type:'radio', label:'האם קיימות מספר משכנתאות על הנכס?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'rex_mt_multi_detail'} },
  { id:'rex_mt_multi_detail', type:'textarea', label:'פירוט משכנתאות נוספות (בנק | יתרה | החזר חודשי)', required:false },
  { id:'rex_refi_type', type:'radio', label:'סוג המחזור', required:false, options:['מחזור באותו בנק','מעבר לבנק אחר','עדיין לא הוחלט'] },
  { id:'rex_refi_goals', type:'checkbox', label:'מטרות המחזור', required:false, options:['הקטנת החזר חודשי','קיצור תקופה','שיפור ריביות','שינוי תמהיל','הגדלת יציבות','התאמה למצב כלכלי חדש','אחר'] },

  // PAGE 3: פרטי ההגדלה
  { id:'pb_rex_expand', type:'page_break', title:'פרטי ההגדלה', showCondition: COND },
  { id:'rex_expand_amount', type:'text', label:'סכום הגדלה מבוקש (₪)', required:false },
  { id:'rex_expand_net', type:'text', label:'סכום נטו נדרש בפועל (₪)', required:false },
  { id:'rex_expand_purpose', type:'checkbox', label:'מטרת ההגדלה', required:false, options:['סגירת הלוואות','שיפוץ','השקעה','עסק','הוצאות רפואיות','סיוע לבן משפחה','אחר'], branching:true, branches:{'אחר':'rex_expand_purpose_other'} },
  { id:'rex_expand_purpose_other', type:'textarea', label:'פירוט', required:false },
  { id:'rex_expand_single_purpose', type:'radio', label:'האם כל סכום ההגדלה מיועד לאותה מטרה?', required:false, options:['כן','לא'], branching:true, branches:{'לא':'rex_expand_split_detail'} },
  { id:'rex_expand_split_detail', type:'textarea', label:'פירוט חלוקת הכספים', required:false },
  { id:'rex_expand_timing', type:'radio', label:'מתי נדרש הכסף?', required:false, options:['מיידי','עד 3 חודשים','3–6 חודשים','מעל 6 חודשים'] },
  { id:'rex_expand_monthly_limit', type:'radio', label:'האם קיימת מגבלה על גובה ההחזר החודשי?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'rex_expand_monthly_max'} },
  { id:'rex_expand_monthly_max', type:'text', label:'החזר חודשי מקסימלי רצוי (₪)', required:false },
  { id:'rex_expand_loan_payoff', type:'radio', label:'האם חלק מההגדלה מיועד לסגירת הלוואות קיימות?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'rex_expand_loan_payoff_amount'} },
  { id:'rex_expand_loan_payoff_amount', type:'text', label:'סכום משוער לסילוק (₪)', required:false },
  { id:'rex_expand_has_docs', type:'radio', label:'האם קיימים מסמכים התומכים במטרת ההגדלה?', required:false, options:['כן','לא'] },

  // PAGE 4: כספים נוספים, זכאות וערבים
  { id:'pb_rex_misc', type:'page_break', title:'זכאות, ערבים ושינויים — מחזור והגדלה', showCondition: COND },
  { id:'rex_extra_funds', type:'radio', label:'האם קיימים כספים זמינים שיכולים לשמש להקטנת יתרת המשכנתא?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'rex_extra_funds_amount'} },
  { id:'rex_extra_funds_amount', type:'text', label:'סכום משוער (₪)', required:false },
  { id:'rex_eligibility', type:'radio', label:'האם קיימת זכאות במשכנתא הקיימת?', required:false, options:['כן','לא','לא ידוע'] },
  { id:'rex_guarantors', type:'radio', label:'האם קיימים ערבים במשכנתא?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'rex_guarantors_count'} },
  { id:'rex_guarantors_count', type:'text', label:'מספר ערבים', required:false },
  { id:'rex_income_change', type:'radio', label:'האם צפוי שינוי משמעותי בהכנסות או בהוצאות בשנה הקרובה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'rex_income_change_detail'} },
  { id:'rex_income_change_detail', type:'textarea', label:'פירוט', required:false },
  { id:'rex_other_loans', type:'radio', label:'האם קיימות הלוואות נוספות מעבר למשכנתא?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'rex_other_loans_monthly'} },
  { id:'rex_other_loans_monthly', type:'text', label:'החזר חודשי כולל (₪)', required:false },

  // PAGE 5: נתוני המשכנתא הקיימת
  { id:'pb_rex_data', type:'page_break', title:'נתוני המשכנתא הקיימת — מחזור והגדלה', showCondition: COND },
  { id:'rex_has_balance_report', type:'radio', label:'האם ברשותכם דוח יתרות לסילוק?', required:false, options:['כן','לא'] },
  { id:'rex_has_tracks_report', type:'radio', label:'האם ברשותכם דוח פירוט מסלולים?', required:false, options:['כן','לא'] },
  { id:'rex_prepay_penalty', type:'radio', label:'האם קיימות עמלות פירעון מוקדם ידועות?', required:false, options:['כן','לא','לא ידוע'], branching:true, branches:{'כן':'rex_prepay_penalty_amount'} },
  { id:'rex_prepay_penalty_amount', type:'text', label:'גובה עמלה משוער (₪)', required:false },

  // PAGE 6: מסמכים
  { id:'pb_rex_docs', type:'page_break', title:'מסמכים — מחזור והגדלת משכנתא', showCondition: COND },
  { id:'doc_rex_balance_report', type:'file', label:'דוח יתרות לסילוק', required:false },
  { id:'doc_rex_tracks_report', type:'file', label:'דוח פירוט מסלולים', required:false },
  { id:'doc_rex_bank_statements', type:'file', label:'דפי עו"ש', required:false },
  { id:'doc_rex_payslips', type:'file', label:'תלושי שכר / הכנסות', required:false },
  { id:'doc_rex_appraisal', type:'file', label:'שמאות (במידה וקיימת)', required:false },
  { id:'doc_rex_purpose_docs', type:'file', label:'מסמכים התומכים במטרת ההגדלה (במידה וקיימים)', required:false },
];

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const f = await Form.findOne({id:'e566c32e'}).lean();
  const qs = f.questions;
  const anchors = ['doc_refi_extra','doc_imp_extra','doc_inv_extra','doc_lrm_extra'];
  let insertAt = -1;
  for (const anchor of anchors) {
    const idx = qs.findIndex(q => q.id === anchor);
    if (idx >= 0) { insertAt = idx + 1; break; }
  }
  if (insertAt < 0) insertAt = qs.findIndex(q => q.id === 'loan_type') + 1;
  qs.splice(insertAt, 0, ...newItems);
  await Form.updateOne({id:'e566c32e'}, {$set:{questions:qs}});
  console.log('Done. Total questions:', qs.length);
  console.log('Added', newItems.length, 'items (', newItems.filter(x=>x.type==='page_break').length, 'pages)');
  mongoose.disconnect();
});
