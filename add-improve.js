require('dotenv').config();
const mongoose = require('mongoose');
const FormSchema = new mongoose.Schema({},{strict:false});
const Form = mongoose.model('Form', FormSchema);

const COND = { qId: 'loan_type', vals: ['משפרי דיור'] };

const newItems = [
  // PAGE 1: הנכס הקיים
  { id:'pb_imp_existing', type:'page_break', title:'הנכס הקיים', showCondition: COND },
  { id:'imp_exist_prop_type', type:'radio', label:'סוג נכס', required:false, options:['דירה','בית פרטי','דו משפחתי','קוטג\'','דירת גן','פנטהאוז','אחר'] },
  { id:'imp_exist_city', type:'text', label:'עיר', required:false },
  { id:'imp_exist_street', type:'text', label:'רחוב', required:false },
  { id:'imp_exist_house_num', type:'text', label:'מספר בית', required:false },
  { id:'imp_exist_apt_num', type:'text', label:'מספר דירה', required:false },
  { id:'imp_exist_value', type:'text', label:'שווי משוער של הנכס (₪)', required:false },
  { id:'imp_exist_mortgage', type:'radio', label:'האם קיימת משכנתא על הנכס?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['imp_exist_mt_bank','imp_exist_mt_balance','imp_exist_mt_monthly']} },
  { id:'imp_exist_mt_bank', type:'text', label:'בנק מלווה', required:false },
  { id:'imp_exist_mt_balance', type:'text', label:'יתרת משכנתא (₪)', required:false },
  { id:'imp_exist_mt_monthly', type:'text', label:'החזר חודשי (₪)', required:false },
  { id:'imp_exist_pledged', type:'radio', label:'האם הנכס משועבד לגוף נוסף?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'imp_exist_pledged_detail'} },
  { id:'imp_exist_pledged_detail', type:'textarea', label:'פירוט שעבוד', required:false },
  { id:'imp_exist_rented', type:'radio', label:'האם הנכס מושכר?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'imp_exist_rent_amount'} },
  { id:'imp_exist_rent_amount', type:'text', label:'גובה שכירות חודשית (₪)', required:false },

  // PAGE 2: מכירת הנכס הקיים
  { id:'pb_imp_sale', type:'page_break', title:'מכירת הנכס הקיים', showCondition: COND },
  { id:'imp_sale_listed', type:'radio', label:'האם הנכס כבר פורסם למכירה?', required:false, options:['כן','לא'] },
  { id:'imp_sale_signed', type:'radio', label:'האם נחתם הסכם מכירה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['imp_sale_price','imp_sale_sign_date','imp_sale_funds_date']} },
  { id:'imp_sale_price', type:'text', label:'מחיר מכירה (₪)', required:false },
  { id:'imp_sale_sign_date', type:'date', label:'תאריך חתימה', required:false },
  { id:'imp_sale_funds_date', type:'date', label:'מועד קבלת כספים צפוי', required:false },
  { id:'imp_sale_dep', type:'radio', label:'האם העסקה תלויה במכירת הנכס הקיים?', required:false, options:['כן','לא'] },
  { id:'imp_sale_timing', type:'radio', label:'מתי צפויה מכירת הנכס הקיים?', required:false, options:['כבר נמכרה','עד 6 חודשים','6–12 חודשים','מעל 12 חודשים','לא ידוע'] },
  { id:'imp_sale_net', type:'text', label:'סכום נטו צפוי לאחר סילוק משכנתא והוצאות (₪)', required:false },
  { id:'imp_sale_repay_mt', type:'radio', label:'האם מתוכנן לפרוע את המשכנתא הקיימת ממכירת הנכס?', required:false, options:['כן','לא','חלקית'] },
  { id:'imp_sale_as_equity', type:'radio', label:'האם כספי מכירת הנכס ישמשו כהון עצמי לרכישה החדשה?', required:false, options:['כן','לא','חלקית'] },
  { id:'imp_bridge', type:'radio', label:'האם צפויה הלוואת גישור?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'imp_bridge_amount'} },
  { id:'imp_bridge_amount', type:'text', label:'סכום גישור מבוקש (₪)', required:false },
  { id:'imp_mt_portability', type:'radio', label:'האם נבדקה אפשרות לגרירת המשכנתא הקיימת?', required:false, options:['כן','לא','לא רלוונטי'] },
  { id:'imp_grace', type:'radio', label:'האם נדרש גרייס בתקופת המעבר?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'imp_grace_detail'} },
  { id:'imp_grace_detail', type:'textarea', label:'פירוט', required:false },
  { id:'imp_time_gap', type:'radio', label:'האם קיים פער זמנים בין מכירת הנכס הקיים לרכישת הנכס החדש?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'imp_time_gap_months'} },
  { id:'imp_time_gap_months', type:'text', label:'מספר חודשים משוער', required:false },

  // PAGE 3: הנכס החדש
  { id:'pb_imp_new', type:'page_break', title:'הנכס החדש', showCondition: COND },
  { id:'imp_new_prop_type', type:'radio', label:'סוג נכס', required:false, options:['דירה','בית פרטי','דו משפחתי','קוטג\'','דירת גן','פנטהאוז','אחר'] },
  { id:'imp_new_prop_status', type:'radio', label:'מצב הנכס', required:false, options:['קיים','בבנייה','על הנייר'] },
  { id:'imp_new_deal_type', type:'radio', label:'סוג העסקה', required:false, options:['יד שנייה','קבלן'] },
  { id:'imp_new_city', type:'text', label:'עיר', required:false },
  { id:'imp_new_street', type:'text', label:'רחוב', required:false },
  { id:'imp_new_house_num', type:'text', label:'מספר בית', required:false },
  { id:'imp_new_apt_num', type:'text', label:'מספר דירה', required:false },
  { id:'imp_new_price', type:'text', label:'מחיר הנכס החדש (₪)', required:false },
  { id:'imp_new_mortgage_req', type:'text', label:'סכום משכנתא מבוקש (₪)', required:false },
  { id:'imp_new_contract_signed', type:'radio', label:'האם נחתם חוזה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'imp_new_contract_date'} },
  { id:'imp_new_contract_date', type:'date', label:'תאריך חתימה', required:false },
  { id:'imp_new_advance_paid', type:'radio', label:'האם שולמה מקדמה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['imp_new_advance_amount','imp_new_advance_date']} },
  { id:'imp_new_advance_amount', type:'text', label:'גובה המקדמה (₪)', required:false },
  { id:'imp_new_advance_date', type:'date', label:'תאריך התשלום', required:false },
  { id:'imp_new_key_date', type:'date', label:'מועד אכלוס / קבלת מפתח צפוי', required:false },
  { id:'imp_new_payment_sched', type:'radio', label:'האם קיים לוח תשלומים?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'imp_new_payment_sched_detail'} },
  { id:'imp_new_payment_sched_detail', type:'textarea', label:'פירוט לוח תשלומים (תאריך | סכום)', required:false },

  // PAGE 4: הון עצמי ומקורות מימון
  { id:'pb_imp_equity', type:'page_break', title:'הון עצמי ומקורות מימון — משפרי דיור', showCondition: COND },
  { id:'imp_eq_amount', type:'text', label:'הון עצמי זמין כיום (₪)', required:false },
  { id:'imp_eq_source', type:'checkbox', label:'מקורות ההון העצמי', required:false, options:['מכירת הנכס הקיים','חסכונות','מתנה מהמשפחה','ירושה','השקעות','אחר'] },
  { id:'imp_eq_gift', type:'radio', label:'האם חלק מההון העצמי מבוסס על מתנה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['imp_eq_gift_name','imp_eq_gift_relation','imp_eq_gift_amount']} },
  { id:'imp_eq_gift_name', type:'text', label:'שם נותן המתנה', required:false },
  { id:'imp_eq_gift_relation', type:'text', label:'קרבה משפחתית', required:false },
  { id:'imp_eq_gift_amount', type:'text', label:'גובה המתנה (₪)', required:false },
  { id:'imp_eq_external', type:'radio', label:'האם קיים מימון חוץ בנקאי?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['imp_eq_external_funder','imp_eq_external_amount']} },
  { id:'imp_eq_external_funder', type:'text', label:'שם הגוף המממן', required:false },
  { id:'imp_eq_external_amount', type:'text', label:'סכום (₪)', required:false },

  // PAGE 5: גורמים מלווים + שמאות
  { id:'pb_imp_parties', type:'page_break', title:'גורמים מלווים ושמאות — משפרי דיור', showCondition: COND },
  { id:'imp_bkr_exists', type:'radio', label:'האם קיים תיווך בעסקת הרכישה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'imp_bkr_fee'} },
  { id:'imp_bkr_fee', type:'text', label:'גובה עמלת תיווך', required:false },
  { id:'imp_law_exists', type:'radio', label:'האם קיים עורך דין מלווה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['imp_law_name','imp_law_phone']} },
  { id:'imp_law_name', type:'text', label:'שם עורך הדין', required:false },
  { id:'imp_law_phone', type:'text', label:'טלפון עורך הדין', required:false },
  { id:'imp_apr_existing', type:'radio', label:'האם בוצעה שמאות לנכס הקיים?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'imp_apr_value'} },
  { id:'imp_apr_value', type:'text', label:'שווי שמאי (₪)', required:false },
  { id:'imp_eligibility', type:'radio', label:'האם קיימת זכאות משרד השיכון?', required:false, options:['כן','לא','לא ידוע'] },

  // PAGE 6: מסמכים
  { id:'pb_imp_docs', type:'page_break', title:'מסמכים — משפרי דיור', showCondition: COND },
  { id:'doc_imp_taboo', type:'file', label:'נסח טאבו / אישור זכויות של הנכס הקיים', required:false },
  { id:'doc_imp_mt_balance', type:'file', label:'דוח יתרת משכנתא', required:false },
  { id:'doc_imp_sale_contract', type:'file', label:'חוזה מכירת הנכס הקיים (במידה וקיים)', required:false },
  { id:'doc_imp_buy_contract', type:'file', label:'חוזה רכישת הנכס החדש', required:false },
  { id:'doc_imp_payments', type:'file', label:'לוח תשלומים', required:false },
  { id:'doc_imp_appraisal', type:'file', label:'שמאות (במידה וקיימת)', required:false },
  { id:'doc_imp_extra', type:'file', label:'מסמכים נוספים', required:false },
];

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const f = await Form.findOne({id:'e566c32e'}).lean();
  const qs = f.questions;
  // Insert after doc_inv_extra (last inv item), or after doc_lrm_extra, or after loan_type
  const anchors = ['doc_inv_extra','doc_lrm_extra'];
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
