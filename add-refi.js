require('dotenv').config();
const mongoose = require('mongoose');
const FormSchema = new mongoose.Schema({},{strict:false});
const Form = mongoose.model('Form', FormSchema);

const COND = { qId: 'loan_type', vals: ['מחזור משכנתא'] };

const newItems = [
  // PAGE 1: פרטי הנכס
  { id:'pb_refi_prop', type:'page_break', title:'פרטי הנכס — מחזור', showCondition: COND },
  { id:'refi_prop_type', type:'radio', label:'סוג נכס', required:false, options:['דירה','בית פרטי','דו משפחתי','קוטג\'','דירת גן','פנטהאוז','אחר'] },
  { id:'refi_prop_city', type:'text', label:'עיר', required:false },
  { id:'refi_prop_street', type:'text', label:'רחוב', required:false },
  { id:'refi_prop_house_num', type:'text', label:'מספר בית', required:false },
  { id:'refi_prop_apt_num', type:'text', label:'מספר דירה', required:false },
  { id:'refi_prop_value', type:'text', label:'שווי משוער של הנכס (₪)', required:false },
  { id:'refi_prop_appraisal', type:'radio', label:'האם בוצעה שמאות ב־12 החודשים האחרונים?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'refi_prop_appraisal_value'} },
  { id:'refi_prop_appraisal_value', type:'text', label:'שווי שמאי (₪)', required:false },
  { id:'refi_prop_rented', type:'radio', label:'האם הנכס מושכר?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'refi_prop_rent_amount'} },
  { id:'refi_prop_rent_amount', type:'text', label:'גובה שכירות חודשית (₪)', required:false },

  // PAGE 2: פרטי המשכנתא
  { id:'pb_refi_mt', type:'page_break', title:'פרטי המשכנתא הקיימת', showCondition: COND },
  { id:'refi_mt_bank', type:'text', label:'בנק נוכחי', required:false },
  { id:'refi_mt_balance', type:'text', label:'יתרת משכנתא לסילוק (₪)', required:false },
  { id:'refi_mt_monthly', type:'text', label:'החזר חודשי נוכחי (₪)', required:false },
  { id:'refi_mt_borrowers', type:'radio', label:'מספר לווים במשכנתא', required:false, options:['1','2','3+'] },
  { id:'refi_mt_multi', type:'radio', label:'האם קיימות מספר משכנתאות על הנכס?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'refi_mt_multi_detail'} },
  { id:'refi_mt_multi_detail', type:'textarea', label:'פירוט משכנתאות נוספות (בנק | יתרה | החזר חודשי)', required:false },

  // PAGE 3: סוג המחזור ומטרות
  { id:'pb_refi_goals', type:'page_break', title:'סוג המחזור ומטרות', showCondition: COND },
  { id:'refi_type', type:'radio', label:'האם מדובר ב:', required:false, options:['מחזור באותו בנק','מעבר לבנק אחר','עדיין לא הוחלט'] },
  { id:'refi_goals', type:'checkbox', label:'מטרות המחזור', required:false, options:['הקטנת החזר חודשי','קיצור תקופה','שיפור ריביות','שינוי תמהיל','הגדלת יציבות','התאמה למצב כלכלי חדש','אחר'] },
  { id:'refi_desired_monthly', type:'text', label:'מהו ההחזר החודשי הרצוי? (₪)', required:false },

  // PAGE 4: נתוני המשכנתא הקיימת
  { id:'pb_refi_data', type:'page_break', title:'נתוני המשכנתא הקיימת', showCondition: COND },
  { id:'refi_has_balance_report', type:'radio', label:'האם ברשותכם דוח יתרות לסילוק?', required:false, options:['כן','לא'] },
  { id:'refi_has_tracks_report', type:'radio', label:'האם ברשותכם דוח פירוט מסלולים?', required:false, options:['כן','לא'] },
  { id:'refi_prepay_penalty', type:'radio', label:'האם קיימות עמלות פירעון מוקדם ידועות?', required:false, options:['כן','לא','לא ידוע'], branching:true, branches:{'כן':'refi_prepay_penalty_amount'} },
  { id:'refi_prepay_penalty_amount', type:'text', label:'גובה עמלה משוער (₪)', required:false },
  { id:'refi_extra_funds', type:'radio', label:'האם קיימים כספים זמינים שיכולים לשמש להקטנת יתרת המשכנתא?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'refi_extra_funds_amount'} },
  { id:'refi_extra_funds_amount', type:'text', label:'סכום משוער (₪)', required:false },

  // PAGE 5: זכאות, ערבים ושינויים
  { id:'pb_refi_misc', type:'page_break', title:'זכאות, ערבים ושינויים צפויים', showCondition: COND },
  { id:'refi_eligibility', type:'radio', label:'האם קיימת זכאות במשכנתא הקיימת?', required:false, options:['כן','לא','לא ידוע'] },
  { id:'refi_guarantors', type:'radio', label:'האם קיימים ערבים במשכנתא?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'refi_guarantors_count'} },
  { id:'refi_guarantors_count', type:'text', label:'מספר ערבים', required:false },
  { id:'refi_income_change', type:'radio', label:'האם צפוי שינוי משמעותי בהכנסות או בהוצאות בשנה הקרובה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'refi_income_change_detail'} },
  { id:'refi_income_change_detail', type:'textarea', label:'פירוט', required:false },
  { id:'refi_other_loans', type:'radio', label:'האם קיימות הלוואות נוספות מעבר למשכנתא?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['refi_other_loans_monthly','refi_other_loans_consolidate']} },
  { id:'refi_other_loans_monthly', type:'text', label:'החזר חודשי כולל (₪)', required:false },
  { id:'refi_other_loans_consolidate', type:'radio', label:'האם קיימת כוונה לסלק הלוואות נוספות במסגרת המחזור?', required:false, options:['כן','לא'] },

  // PAGE 6: מסמכים
  { id:'pb_refi_docs', type:'page_break', title:'מסמכים — מחזור משכנתא', showCondition: COND },
  { id:'doc_refi_balance_report', type:'file', label:'דוח יתרות לסילוק', required:false },
  { id:'doc_refi_tracks_report', type:'file', label:'דוח פירוט מסלולים', required:false },
  { id:'doc_refi_bank_statements', type:'file', label:'דפי עו"ש', required:false },
  { id:'doc_refi_payslips', type:'file', label:'תלושי שכר / הכנסות', required:false },
  { id:'doc_refi_appraisal', type:'file', label:'שמאות (במידה וקיימת)', required:false },
  { id:'doc_refi_extra', type:'file', label:'מסמכים נוספים', required:false },
];

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const f = await Form.findOne({id:'e566c32e'}).lean();
  const qs = f.questions;
  const anchors = ['doc_imp_extra','doc_inv_extra','doc_lrm_extra'];
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
