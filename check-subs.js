require('dotenv').config();
const mongoose = require('mongoose');
const Sub = mongoose.model('Submission', new mongoose.Schema({},{strict:false}));

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const subs = await Sub.find({ formId: { $nin: ['__contact__','__manual__'] } }).lean();
  console.log('Total submissions:', subs.length);
  subs.forEach(s => {
    const fileKeys = Object.entries(s.answers || {}).filter(([k, v]) => {
      if (typeof v !== 'string') return false;
      try { const p = JSON.parse(v); return p && p.url && p.name; } catch { return false; }
    });
    console.log('\nSub:', s.id, '| linkedLeadId:', s.linkedLeadId || '(none)');
    console.log('  All answer keys:', Object.keys(s.answers || {}).join(', '));
    console.log('  File answers:', fileKeys.length);
    fileKeys.forEach(([k,v]) => console.log('   ', k, '→', v));
  });
  mongoose.disconnect();
});
