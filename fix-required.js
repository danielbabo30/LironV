// fix-required.js — sets required=false on all questions in form e566c32e
// Run: node fix-required.js
require('dotenv').config();
const mongoose = require('mongoose');

const FormSchema = new mongoose.Schema({
  id: String, title: String, description: String,
  questions: mongoose.Schema.Types.Mixed,
  createdAt: String, updatedAt: String,
}, { strict: false });
const Form = mongoose.model('Form', FormSchema);

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected');

  const form = await Form.findOne({ id: 'e566c32e' }).lean();
  if (!form) { console.error('Form not found'); process.exit(1); }

  console.log('Title:', form.title);
  console.log('Questions:', form.questions?.length);

  // Set required=false on every question
  const updated = (form.questions || []).map(q => ({ ...q, required: false }));

  await Form.updateOne({ id: 'e566c32e' }, { $set: { questions: updated } });

  const check = await Form.findOne({ id: 'e566c32e' }).lean();
  const stillRequired = check.questions.filter(q => q.required).length;
  console.log('Done. Still required:', stillRequired);
  console.log('Title after update:', check.title);
  console.log('First question title:', check.questions?.[0]?.title);

  await mongoose.disconnect();
})();
