require('dotenv').config();
const mongoose = require('mongoose');
const Sub = mongoose.model('Submission', new mongoose.Schema({},{strict:false}));
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const res = await Sub.deleteMany({ formId: { $in: ['__contact__','__manual__'] } });
  console.log('Deleted:', res.deletedCount);
  mongoose.disconnect();
});
