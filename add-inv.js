require('dotenv').config();
const mongoose = require('mongoose');
const FormSchema = new mongoose.Schema({},{strict:false});
const Form = mongoose.model('Form', FormSchema);

const COND = { qId: 'loan_type', vals: ['רכישת נכס להשקעה'] };

const newItems = [
  // PAGE 1: פרטי הנכס
  { id:'pb_inv_prop', type:'page_break', title:'פרטי הנכס — השקעה', showCondition: COND },
  { id:'inv_prop_type', type:'radio', label:'סוג נכס', required:false, options:['דירה','בית פרטי','דו משפחתי','קוטג\'','דירת גן','פנטהאוז','יחידת דיור','אחר'] },
  { id:'inv_prop_status', type:'radio', label:'מצב הנכס', required:false, options:['קיים','בבנייה','על הנייר'] },
  { id:'inv_prop_deal_type', type:'radio', label:'סוג העסקה', required:false, options:['יד שנייה','קבלן'] },
  { id:'inv_prop_city', type:'text', label:'עיר', required:false },
  { id:'inv_prop_street', type:'text', label:'רחוב', required:false },
  { id:'inv_prop_house_num', type:'text', label:'מספר בית', required:false },
  { id:'inv_prop_apt_num', type:'text', label:'מספר דירה', required:false },
  { id:'inv_prop_rooms', type:'text', label:'מספר חדרים', required:false },
  { id:'inv_prop_built_area', type:'text', label:'שטח בנוי (מ"ר)', required:false },
  { id:'inv_prop_parking', type:'radio', label:'חניה', required:false, options:['אין','חניה אחת','שתי חניות','יותר משתי חניות'] },
  { id:'inv_prop_storage', type:'radio', label:'מחסן', required:false, options:['כן','לא'] },
  { id:'inv_prop_elevator', type:'radio', label:'מעלית', required:false, options:['כן','לא'] },
  { id:'inv_prop_rented', type:'radio', label:'האם הנכס מושכר כיום?', required:false, options:['כן','לא','לא ידוע'], branching:true, branches:{'כן':'inv_prop_rent_amount'} },
  { id:'inv_prop_rent_amount', type:'text', label:'גובה שכירות חודשית (₪)', required:false },
  { id:'inv_prop_violations', type:'radio', label:'האם ידוע על חריגות בנייה או בעיות תכנוניות?', required:false, options:['כן','לא','לא ידוע'], branching:true, branches:{'כן':'inv_prop_violations_detail'} },
  { id:'inv_prop_violations_detail', type:'textarea', label:'פירוט', required:false },

  // PAGE 2: פרטי העסקה
  { id:'pb_inv_deal', type:'page_break', title:'פרטי העסקה — השקעה', showCondition: COND },
  { id:'inv_deal_seller_type', type:'radio', label:'ממי נרכש הנכס?', required:false, options:['אדם פרטי','קבלן','חברה משכנת','כונס נכסים','אחר'] },
  { id:'inv_deal_price', type:'text', label:'מחיר הנכס (₪)', required:false },
  { id:'inv_deal_mortgage_req', type:'text', label:'סכום משכנתא מבוקש (₪)', required:false },
  { id:'inv_deal_contract_signed', type:'radio', label:'האם נחתם חוזה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'inv_deal_contract_date'} },
  { id:'inv_deal_contract_date', type:'date', label:'תאריך חתימה', required:false },
  { id:'inv_deal_advance_paid', type:'radio', label:'האם שולמה מקדמה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['inv_deal_advance_amount','inv_deal_advance_date']} },
  { id:'inv_deal_advance_amount', type:'text', label:'גובה המקדמה (₪)', required:false },
  { id:'inv_deal_advance_date', type:'date', label:'תאריך תשלום המקדמה', required:false },
  { id:'inv_deal_key_date', type:'date', label:'מועד אכלוס / קבלת מפתח צפוי', required:false },
  { id:'inv_deal_payment_sched', type:'radio', label:'האם קיים לוח תשלומים?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'inv_deal_payment_sched_detail'} },
  { id:'inv_deal_payment_sched_detail', type:'textarea', label:'פירוט לוח תשלומים (תאריך | סכום)', required:false },

  // PAGE 3: פרטי ההשקעה
  { id:'pb_inv_details', type:'page_break', title:'פרטי ההשקעה', showCondition: COND },
  { id:'inv_rental_intent', type:'radio', label:'האם הנכס מיועד להשכרה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'inv_expected_rent'} },
  { id:'inv_expected_rent', type:'text', label:'שכירות חודשית צפויה (₪)', required:false },
  { id:'inv_purpose', type:'radio', label:'מטרת ההשקעה', required:false, options:['הכנסה משכירות','עליית ערך','השקעה לטווח ארוך','השקעה לטווח קצר','שילוב מטרות'] },
  { id:'inv_other_props', type:'radio', label:'האם קיימים כיום נכסים נוספים בבעלותכם?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['inv_other_props_count','inv_other_props_mortgage','inv_other_props_monthly']} },
  { id:'inv_other_props_count', type:'text', label:'מספר נכסים', required:false },
  { id:'inv_other_props_mortgage', type:'radio', label:'האם קיימת משכנתא על אחד או יותר מהנכסים?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'inv_other_props_monthly'} },
  { id:'inv_other_props_monthly', type:'text', label:'החזר חודשי כולל (₪)', required:false },
  { id:'inv_via_company', type:'radio', label:'האם הנכס נרכש באמצעות חברה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['inv_company_name','inv_company_id']} },
  { id:'inv_company_name', type:'text', label:'שם החברה', required:false },
  { id:'inv_company_id', type:'text', label:'ח.פ.', required:false },
  { id:'inv_partners', type:'radio', label:'האם קיימים שותפים בעסקה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'inv_partners_count'} },
  { id:'inv_partners_count', type:'text', label:'מספר שותפים', required:false },
  { id:'inv_registration_name', type:'radio', label:'הנכס יירשם על שם:', required:false, options:['יחיד','בני זוג','חברה','שותפים'] },

  // PAGE 4: הון עצמי
  { id:'pb_inv_equity', type:'page_break', title:'הון עצמי ומקורות מימון — השקעה', showCondition: COND },
  { id:'inv_eq_amount', type:'text', label:'הון עצמי קיים (₪)', required:false },
  { id:'inv_eq_source', type:'checkbox', label:'מקור ההון העצמי', required:false, options:['חסכונות','מכירת נכס','מתנה מהמשפחה','ירושה','השקעות','אחר'] },
  { id:'inv_eq_gift', type:'radio', label:'האם חלק מההון העצמי מבוסס על מתנה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['inv_eq_gift_name','inv_eq_gift_relation','inv_eq_gift_amount']} },
  { id:'inv_eq_gift_name', type:'text', label:'שם נותן המתנה', required:false },
  { id:'inv_eq_gift_relation', type:'text', label:'קרבה משפחתית', required:false },
  { id:'inv_eq_gift_amount', type:'text', label:'גובה המתנה (₪)', required:false },
  { id:'inv_eq_bridge', type:'radio', label:'האם קיימת הלוואת השלמת הון עצמי?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'inv_eq_bridge_amount'} },
  { id:'inv_eq_bridge_amount', type:'text', label:'סכום הלוואת ההשלמה (₪)', required:false },
  { id:'inv_eq_external', type:'radio', label:'האם קיים מימון חוץ בנקאי בעסקה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['inv_eq_external_funder','inv_eq_external_amount']} },
  { id:'inv_eq_external_funder', type:'text', label:'שם הגוף המממן', required:false },
  { id:'inv_eq_external_amount', type:'text', label:'סכום (₪)', required:false },

  // PAGE 5: גורמים מלווים + שמאות
  { id:'pb_inv_parties', type:'page_break', title:'גורמים מלווים ושמאות — השקעה', showCondition: COND },
  { id:'inv_bkr_exists', type:'radio', label:'האם קיים תיווך בעסקה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'inv_bkr_fee'} },
  { id:'inv_bkr_fee', type:'text', label:'גובה עמלת תיווך', required:false },
  { id:'inv_law_exists', type:'radio', label:'האם קיים עורך דין מלווה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['inv_law_name','inv_law_phone']} },
  { id:'inv_law_name', type:'text', label:'שם עורך הדין', required:false },
  { id:'inv_law_phone', type:'text', label:'טלפון עורך הדין', required:false },
  { id:'inv_apr_done', type:'radio', label:'האם בוצעה שמאות?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'inv_apr_value'} },
  { id:'inv_apr_value', type:'text', label:'שווי שמאי (₪)', required:false },

  // PAGE 6: מסמכים
  { id:'pb_inv_docs', type:'page_break', title:'מסמכים — רכישת נכס להשקעה', showCondition: COND },
  { id:'doc_inv_contract', type:'file', label:'חוזה רכישה', required:false },
  { id:'doc_inv_taboo', type:'file', label:'נסח טאבו / אישור זכויות', required:false },
  { id:'doc_inv_payments', type:'file', label:'לוח תשלומים', required:false },
  { id:'doc_inv_appraisal', type:'file', label:'שמאות (במידה וקיימת)', required:false },
  { id:'doc_inv_rental', type:'file', label:'חוזה שכירות (במידה וקיים)', required:false },
  { id:'doc_inv_extra', type:'file', label:'מסמכים נוספים', required:false },
];

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const f = await Form.findOne({id:'e566c32e'}).lean();
  const qs = f.questions;
  // Insert after the last lrm page (doc_lrm_extra) or after loan_type block
  // Find last item of lrm section
  const lastLrm = qs.findIndex(q => q.id === 'doc_lrm_extra');
  const insertAt = lastLrm >= 0 ? lastLrm + 1 : qs.findIndex(q => q.id === 'loan_type') + 1;
  qs.splice(insertAt, 0, ...newItems);
  await Form.updateOne({id:'e566c32e'}, {$set:{questions:qs}});
  console.log('Done. Total questions:', qs.length);
  console.log('Added', newItems.length, 'items (', newItems.filter(x=>x.type==='page_break').length, 'pages)');
  mongoose.disconnect();
});
