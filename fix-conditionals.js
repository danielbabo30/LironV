// fix-conditionals.js
// Splits pages so that "האם יש X?" is on its own page,
// and the detail questions follow on a page with showCondition.
// Run: node fix-conditionals.js
require('dotenv').config();
const mongoose = require('mongoose');
const FormSchema = new mongoose.Schema({}, { strict: false });
const Form = mongoose.model('Form', FormSchema);

// Each entry: the question id that acts as the gate,
// the vals that show the details, and the label for the details page.
const SPLITS = [
  { gateId: 'ln2_exists', vals: ['כן'], detailPageTitle: 'הלוואה 2 — פרטים' },
  { gateId: 'ln3_exists', vals: ['כן'], detailPageTitle: 'הלוואה 3 — פרטים' },
  { gateId: 'ln4_exists', vals: ['כן'], detailPageTitle: 'הלוואה 4 — פרטים' },
  { gateId: 'mt1_exists', vals: ['כן'], detailPageTitle: 'משכנתא 1 — פרטים' },
  { gateId: 'mt2_exists', vals: ['כן'], detailPageTitle: 'משכנתא 2 — פרטים' },
  { gateId: 'mt3_exists', vals: ['כן'], detailPageTitle: 'משכנתא 3 — פרטים' },
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected');

  const form = await Form.findOne({ id: 'e566c32e' }).lean();
  if (!form) { console.error('Form not found'); process.exit(1); }

  let qs = [...form.questions];

  for (const { gateId, vals, detailPageTitle } of SPLITS) {
    const gateIdx = qs.findIndex(q => q.id === gateId);
    if (gateIdx === -1) { console.log('Not found:', gateId); continue; }

    // Check: is there already a page_break with showCondition right after the gate?
    const nextPb = qs[gateIdx + 1];
    if (nextPb && nextPb.type === 'page_break' && nextPb.showCondition) {
      console.log('Already split:', gateId);
      continue;
    }

    // Insert a new page_break right after the gate question
    const newPb = {
      id: 'pb_' + gateId + '_detail',
      type: 'page_break',
      title: detailPageTitle,
      showCondition: { qId: gateId, vals }
    };
    qs.splice(gateIdx + 1, 0, newPb);
    console.log('Split:', gateId, '→', detailPageTitle);
  }

  await Form.updateOne({ id: 'e566c32e' }, { $set: { questions: qs } });
  console.log('Done. Total questions:', qs.length);
  await mongoose.disconnect();
})();
