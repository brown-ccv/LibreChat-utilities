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

const warningDateObj = new Date();
warningDateObj.setDate(warningDateObj.getDate() - (daysNumber - 10));
console.log(`Warning date: ${warningDateObj.toISOString()} (${daysNumber - 10} days ago)`);

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


function buildActivityLookupPipeline() {
  return [
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
    }
  ];
}


function buildWarningMatchStage(warningDate) {
  const startOfDay = new Date(warningDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(warningDate);
  endOfDay.setHours(23, 59, 59, 999);

  return {
    $match: {
      lastActivityDate: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    }
  };
}

function buildDeletionMatchStage(cutoffDate) {
  return {
    $match: {
      $or: [
        { lastActivityDate: { $exists: false } },
        { lastActivityDate: null },
        { lastActivityDate: { $lt: cutoffDate } }
      ]
    }
  };
}

function buildUsersForWarningQuery(warningDate) {
  return [
    ...buildActivityLookupPipeline(),
    buildWarningMatchStage(warningDate)
  ];
}

function buildUsersForDeletionQuery(cutoffDate) {
  return [
    ...buildActivityLookupPipeline(),
    buildDeletionMatchStage(cutoffDate)
  ];
}

async function findInactiveUsers(warningDate, cutoffDate) {
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // Find users to warn (10 days before deletion)
    const usersToWarn = await db.collection('users')
      .aggregate(buildUsersForWarningQuery(warningDate))
      .toArray();

    const usersToDelete = await db.collection('users')
      .aggregate(buildUsersForDeletionQuery(cutoffDate))
      .toArray();

    console.log('\n=== USERS TO WARN ===');
    console.log(`Found ${usersToWarn.length} users (last activity on ${warningDate.toISOString().split('T')[0]}):`);
    console.log('---');
    for (const user of usersToWarn) {
      console.log(`User: ${user.email || user.name || user._id}`);
      console.log(`  Last activity: ${user.lastActivityDate ? new Date(user.lastActivityDate).toISOString() : 'No activity'}`);
      console.log(`  ⚠️  Send warning email`);
      console.log('---');
    }

    console.log('\n=== USERS TO DELETE ===');
    console.log(`Found ${usersToDelete.length} users (inactive 180+ days):`);
    console.log('---');
    for (const user of usersToDelete) {
      console.log(`User: ${user.email || user.name || user._id}`);
      console.log(`  Last activity: ${user.lastActivityDate ? new Date(user.lastActivityDate).toISOString() : 'No activity'}`);
      console.log(`  🗑️  Candidate for deletion`);
      console.log('---');
    }


    console.log('Operation completed successfully');
    return { usersToWarn, usersToDelete };

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('Connection closed');
  }
}

// execute the function with a sample cutoff date

findInactiveUsers(warningDateObj, cutoffDateObj);