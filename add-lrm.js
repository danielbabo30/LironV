require('dotenv').config();
const mongoose = require('mongoose');
const FormSchema = new mongoose.Schema({},{strict:false});
const Form = mongoose.model('Form', FormSchema);

const COND = { qId: 'loan_type', vals: ['רכישת נכס למגורים'] };

const newItems = [
  // PAGE 1: פרטי הנכס
  { id:'pb_lrm_prop', type:'page_break', title:'פרטי הנכס', showCondition: COND },
  { id:'prop_type', type:'radio', label:'סוג נכס', required:false, options:['דירה','בית פרטי','דו משפחתי','קוטג\'','דירת גן','פנטהאוז','אחר'] },
  { id:'prop_status', type:'radio', label:'מצב הנכס', required:false, options:['קיים','בבנייה','על הנייר'] },
  { id:'prop_deal_type', type:'radio', label:'סוג העסקה', required:false, options:['יד שנייה','קבלן'] },
  { id:'prop_city', type:'text', label:'עיר', required:false },
  { id:'prop_street', type:'text', label:'רחוב', required:false },
  { id:'prop_house_num', type:'text', label:'מספר בית', required:false },
  { id:'prop_apt_num', type:'text', label:'מספר דירה', required:false },
  { id:'prop_floor', type:'text', label:'קומה', required:false },
  { id:'prop_floors_total', type:'text', label:'מספר קומות בבניין', required:false },
  { id:'prop_rooms', type:'text', label:'מספר חדרים', required:false },
  { id:'prop_built_area', type:'text', label:'שטח בנוי (מ"ר)', required:false },
  { id:'prop_balcony_area', type:'text', label:'שטח מרפסת (מ"ר)', required:false },
  { id:'prop_garden_area', type:'text', label:'שטח גינה (מ"ר)', required:false },
  { id:'prop_parking', type:'radio', label:'חניה', required:false, options:['אין','חניה אחת','שתי חניות','יותר משתי חניות'] },
  { id:'prop_storage', type:'radio', label:'מחסן', required:false, options:['כן','לא'] },
  { id:'prop_elevator', type:'radio', label:'מעלית', required:false, options:['כן','לא'] },
  { id:'prop_year_built', type:'text', label:'שנת בנייה', required:false },
  { id:'prop_registration', type:'radio', label:'סוג רישום', required:false, options:['טאבו','רמ"י','חברה משכנת','לא ידוע'] },
  { id:'prop_rights', type:'checkbox', label:'זכויות נוספות', required:false, options:['גג','גינה','יחידת דיור','מחסן','חניה','ללא'] },
  { id:'prop_rented', type:'radio', label:'האם הנכס מושכר כיום?', required:false, options:['כן','לא','לא ידוע'] },
  { id:'prop_violations', type:'radio', label:'האם ידוע על חריגות בנייה או בעיות תכנוניות?', required:false, options:['כן','לא','לא ידוע'], branching:true, branches:{'כן':'prop_violations_detail'} },
  { id:'prop_violations_detail', type:'textarea', label:'פירוט', required:false },

  // PAGE 2: פרטי העסקה
  { id:'pb_lrm_deal', type:'page_break', title:'פרטי העסקה', showCondition: COND },
  { id:'deal_seller_type', type:'radio', label:'ממי נרכש הנכס?', required:false, options:['אדם פרטי','קבלן','חברה משכנת','כונס נכסים','אחר'] },
  { id:'deal_price', type:'text', label:'מחיר הנכס (₪)', required:false },
  { id:'deal_mortgage_req', type:'text', label:'סכום משכנתא מבוקש (₪)', required:false },
  { id:'deal_contract_signed', type:'radio', label:'האם נחתם חוזה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['deal_contract_date','deal_conditions','deal_conditions_detail']} },
  { id:'deal_contract_date', type:'date', label:'תאריך חתימה', required:false },
  { id:'deal_conditions', type:'radio', label:'האם קיימים תנאים מתלים בחוזה?', required:false, options:['כן','לא','לא ידוע'], branching:true, branches:{'כן':'deal_conditions_detail'} },
  { id:'deal_conditions_detail', type:'textarea', label:'פירוט תנאים מתלים', required:false },
  { id:'deal_advance_paid', type:'radio', label:'האם שולמה מקדמה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['deal_advance_amount','deal_advance_date']} },
  { id:'deal_advance_amount', type:'text', label:'גובה המקדמה (₪)', required:false },
  { id:'deal_advance_date', type:'date', label:'תאריך תשלום המקדמה', required:false },
  { id:'deal_key_date', type:'date', label:'מועד אכלוס / קבלת מפתח צפוי', required:false },
  { id:'deal_payment_sched', type:'radio', label:'האם קיים לוח תשלומים?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'deal_payment_sched_detail'} },
  { id:'deal_payment_sched_detail', type:'textarea', label:'פירוט לוח תשלומים (תאריך | סכום)', required:false },
  { id:'deal_status', type:'radio', label:'סטטוס העסקה', required:false, options:['בדיקת נכס','משא ומתן','חוזה חתום','לאחר תשלום מקדמה','לפני משכנתא','לקראת אכלוס'] },

  // PAGE 3: הון עצמי
  { id:'pb_lrm_equity', type:'page_break', title:'הון עצמי ומקורות מימון', showCondition: COND },
  { id:'eq_amount', type:'text', label:'הון עצמי קיים (₪)', required:false },
  { id:'eq_source', type:'checkbox', label:'מקור ההון העצמי', required:false, options:['חסכונות','מכירת נכס','מתנה מהמשפחה','ירושה','השקעות','אחר'] },
  { id:'eq_gift', type:'radio', label:'האם חלק מההון העצמי מבוסס על מתנה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['eq_gift_name','eq_gift_relation','eq_gift_amount']} },
  { id:'eq_gift_name', type:'text', label:'שם נותן המתנה', required:false },
  { id:'eq_gift_relation', type:'text', label:'קרבה משפחתית', required:false },
  { id:'eq_gift_amount', type:'text', label:'גובה המתנה (₪)', required:false },
  { id:'eq_bridge', type:'radio', label:'האם קיימת הלוואת השלמת הון עצמי?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'eq_bridge_amount'} },
  { id:'eq_bridge_amount', type:'text', label:'סכום הלוואת ההשלמה (₪)', required:false },
  { id:'eq_external', type:'radio', label:'האם קיים מימון חוץ בנקאי בעסקה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['eq_external_funder','eq_external_amount']} },
  { id:'eq_external_funder', type:'text', label:'שם הגוף המממן', required:false },
  { id:'eq_external_amount', type:'text', label:'סכום (₪)', required:false },
  { id:'eq_prop_sale_dep', type:'radio', label:'האם קיימת תלות במכירת נכס אחר לצורך השלמת העסקה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'eq_prop_sale_detail'} },
  { id:'eq_prop_sale_detail', type:'textarea', label:'פירוט', required:false },

  // PAGE 4: גורמים מלווים + שמאות
  { id:'pb_lrm_parties', type:'page_break', title:'גורמים מלווים ושמאות', showCondition: COND },
  { id:'bkr_exists', type:'radio', label:'האם קיים תיווך בעסקה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'bkr_fee'} },
  { id:'bkr_fee', type:'text', label:'גובה עמלת תיווך', required:false },
  { id:'law_exists', type:'radio', label:'האם קיים עורך דין מלווה?', required:false, options:['כן','לא'], branching:true, branches:{'כן':['law_name','law_phone']} },
  { id:'law_name', type:'text', label:'שם עורך הדין', required:false },
  { id:'law_phone', type:'text', label:'טלפון עורך הדין', required:false },
  { id:'apr_done', type:'radio', label:'האם בוצעה שמאות?', required:false, options:['כן','לא'], branching:true, branches:{'כן':'apr_value'} },
  { id:'apr_value', type:'text', label:'שווי שמאי (₪)', required:false },
  { id:'apr_eligibility', type:'radio', label:'האם קיימת זכאות משרד השיכון?', required:false, options:['כן','לא','לא ידוע'] },
  { id:'apr_urgent', type:'radio', label:'האם נדרש אישור עקרוני דחוף?', required:false, options:['כן','לא'] },

  // PAGE 5: מסמכים
  { id:'pb_lrm_docs', type:'page_break', title:'מסמכים — רכישת נכס', showCondition: COND },
  { id:'doc_lrm_contract', type:'file', label:'חוזה רכישה', required:false },
  { id:'doc_lrm_taboo', type:'file', label:'נסח טאבו / אישור זכויות', required:false },
  { id:'doc_lrm_payments', type:'file', label:'לוח תשלומים', required:false },
  { id:'doc_lrm_appraisal', type:'file', label:'שמאות (במידה וקיימת)', required:false },
  { id:'doc_lrm_eligibility', type:'file', label:'אישור זכאות (במידה וקיים)', required:false },
  { id:'doc_lrm_extra', type:'file', label:'מסמכים נוספים', required:false },
];

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const f = await Form.findOne({id:'e566c32e'}).lean();
  const qs = f.questions;
  const ltIdx = qs.findIndex(q => q.id === 'loan_type');
  qs.splice(ltIdx + 1, 0, ...newItems);
  await Form.updateOne({id:'e566c32e'}, {$set:{questions:qs}});
  console.log('Done. Total questions:', qs.length);
  console.log('Added', newItems.length, 'items (', newItems.filter(x=>x.type==='page_break').length, 'pages)');
  mongoose.disconnect();
});
