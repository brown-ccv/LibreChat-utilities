const mongoose = require('mongoose');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI environment variable is not set');
  process.exit(1);
}

const cutoffDays = process.env.CUTOFF_DAYS;
if (!cutoffDays) {
  console.error('CUTOFF_DAYS environment variable is not set');
  process.exit(1);
}

const daysNumber = parseInt(cutoffDays, 10);
if (isNaN(daysNumber) || daysNumber <= 0) {
  console.error('CUTOFF_DAYS must be a positive number of days');
  process.exit(1);
}

const cutoffDateObj = new Date();
cutoffDateObj.setDate(cutoffDateObj.getDate() - daysNumber);
console.log(`Using cutoff date: ${cutoffDateObj.toISOString()} (${daysNumber} days ago)`);


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

        const usersToRemove = await db.collection('users').aggregate([
          {
            $lookup: {
              from: 'transactions',
              localField: '_id',
              foreignField: 'user',
              pipeline: [
                { $sort: { createdAt: -1 } },
                { $limit: 1 },
                { $project: { createdAt: 1 } }
              ],
              as: 'lastTransaction'
            }
          },
          {
            $lookup: {
              from: 'files',
              localField: '_id',
              foreignField: 'user',
              pipeline: [
                { $sort: { createdAt: -1 } },
                { $limit: 1 },
                { $project: { createdAt: 1 } }
              ],
              as: 'lastFile'
            }
          },
          {
            $lookup: {
              from: 'messages',
              localField: '_id',
              foreignField: 'user',
              pipeline: [
                { $sort: { createdAt: -1 } },
                { $limit: 1 },
                { $project: { createdAt: 1 } }
              ],
              as: 'lastMessage'
            }
          },
          {
            $addFields: {
              lastActivityDate: {
                $max: [
                  { $arrayElemAt: ['$lastTransaction.createdAt', 0] },
                  { $arrayElemAt: ['$lastFile.createdAt', 0] },
                  { $arrayElemAt: ['$lastMessage.createdAt', 0] }
                ]
              }
            }
          },
          {
            $match: {
              $or: [
                { lastActivityDate: { $exists: false } },
                { lastActivityDate: null }, 
                { lastActivityDate: { $lt: cutoffDate } }
              ]
            }
          }
        ]).toArray();

        console.log(`Found ${usersToRemove.length} users:`);
        console.log('---');

      }); 
      console.log('Transaction completed successfully');
    } 
    finally {
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