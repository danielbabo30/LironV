require('dotenv').config();
const mongoose = require('mongoose');
const Sub = mongoose.model('Submission', new mongoose.Schema({},{strict:false}));

mongoose.connect(process.env.MONGO_URI).then(async () => {
  // Add a fake file answer to the linked submission dd3a6c98
  const res = await Sub.updateOne(
    { id: 'dd3a6c98' },
    { $set: {
      'answers.q_doc_id': JSON.stringify({ url: '/api/files/testfile123', name: 'תעודת_זהות.pdf' }),
      'answers.q_doc_payslips': JSON.stringify({ url: '/api/files/testfile456', name: 'תלושי_שכר.pdf' })
    }}
  );
  console.log('Updated:', res.modifiedCount);
  mongoose.disconnect();
});
