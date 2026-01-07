const mongoose = require('mongoose');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI environment variable is not set');
  process.exit(1);
}

const cutoffDate = process.env.CUTOFF_DATE
if (!cutoffDate) {
  console.error('CUTOFF_DATE environment variable is not set');
  process.exit(1);
}

const cutoffDateObj = new Date(cutoffDate);
if (isNaN(cutoffDateObj.getTime())) {
  console.error('CUTOFF_DATE is not a valid date');
  process.exit(1);
}

console.log(`Using cutoff date: ${cutoffDateObj.toISOString()}`);

const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const tokenSchema = new mongoose.Schema({}, { strict: false, collection: 'tokens' });
const sessionSchema = new mongoose.Schema({}, { strict: false, collection: 'sessions' });
const conversationSchema = new mongoose.Schema({}, { strict: false, collection: 'conversations' });
const messageSchema = new mongoose.Schema({}, { strict: false, collection: 'messages' });
const fileSchema = new mongoose.Schema({}, { strict: false, collection: 'files' });
const presetSchema = new mongoose.Schema({}, { strict: false, collection: 'presets' });
const promptSchema = new mongoose.Schema({}, { strict: false, collection: 'prompts' });
const transactionSchema = new mongoose.Schema({}, { strict: false, collection: 'transactions' });

const User = mongoose.model('User', userSchema);
const Token = mongoose.model('Token', tokenSchema);
const Session = mongoose.model('Session', sessionSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);
const Message = mongoose.model('Message', messageSchema);
const File = mongoose.model('File', fileSchema);
const Preset = mongoose.model('Preset', presetSchema);
const Prompt = mongoose.model('Prompt', promptSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

async function purgeUserDataByDate(cutoffDate) {
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {

        const users = await db.collection('users').find({}).toArray();
        console.log(`Found ${users.length} users:`);
        console.log('---');
        for (const user of users) {
          const mostRecentTransaction = await db.collection('transactions')
            .find({ user: user._id })
            .sort({ createdAt: -1 })
            .limit(1)
            .toArray();
          const lastTransactionDate = mostRecentTransaction.length > 0 
            ? mostRecentTransaction[0].createdAt 
            : null;
          console.log(`User: ${user.email || user.name}`);
          console.log(`  Last transaction: ${lastTransactionDate ? lastTransactionDate.toISOString() : 'No transactions'}`);
          if (lastTransactionDate && lastTransactionDate < cutoffDate) {
            console.log(`  ⚠️  Last activity before cutoff date - candidate for deletion`);
          }
          console.log('---')
        };
        
        // Your delete operations here
        // const result = await db.collection('users').deleteMany({ createdAt: { $lt: cutoffDate } }, { session });
        // console.log(`Deleted ${result.deletedCount} users`);
        // Add more collections as needed
      });
      console.log('Transaction completed successfully');
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Connection closed');
  }
}

// execute the function with a sample cutoff date

purgeUserDataByDate(cutoffDateObj);