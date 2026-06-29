require('dotenv').config();
const mongoose = require('mongoose');
const FormSchema = new mongoose.Schema({},{strict:false});
const Form = mongoose.model('Form', FormSchema);

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const f = await Form.findOne({id:'e566c32e'}).lean();
  const qs = f.questions;

  // Find the employment status question and the business type question
  const empIdx = qs.findIndex(q =>
    q.options && q.options.includes('שכיר') && q.options.includes('עצמאי') && q.options.includes('פנסיונר')
  );
  const bizIdx = qs.findIndex(q =>
    q.options && q.options.includes('עוסק פטור') && q.options.includes('עוסק מורשה')
  );

  if (empIdx < 0 || bizIdx < 0) {
    console.log('Questions not found. emp:', empIdx, 'biz:', bizIdx);
    // Print nearby questions for diagnosis
    qs.filter(q => q.options && (q.options.includes('שכיר') || q.options.includes('עוסק פטור')))
      .forEach(q => console.log(q.id, q.label, q.options));
    mongoose.disconnect(); return;
  }

  const empQ = qs[empIdx];
  const bizQ = qs[bizIdx];
  console.log('Employment Q:', empQ.id, '|', empQ.label);
  console.log('Biz type Q: ', bizQ.id, '|', bizQ.label);

  // Add branching to employment question: כן to show biz type question
  qs[empIdx] = {
    ...empQ,
    branching: true,
    branches: {
      'עצמאי':        bizQ.id,
      'שכיר+עצמאי':   bizQ.id,
    }
  };

  await Form.updateOne({id:'e566c32e'}, {$set:{questions:qs}});
  console.log('Done — branching added.');
  mongoose.disconnect();
});
