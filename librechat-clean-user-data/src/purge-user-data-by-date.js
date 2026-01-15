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

const actionSchema = new mongoose.Schema({}, { strict: false, collection: 'actions' });
const aclEntrySchema = new mongoose.Schema({}, { strict: false, collection: 'aclentries' });
const agentSchema = new mongoose.Schema({}, { strict: false, collection: 'agents' });
const assistantSchema = new mongoose.Schema({}, { strict: false, collection: 'assistants' });
const balanceSchema = new mongoose.Schema({}, { strict: false, collection: 'balances' });
const conversationtagSchema = new mongoose.Schema({}, { strict: false, collection: 'conversationtags' });
const keySchema = new mongoose.Schema({}, { strict: false, collection: 'keys' });
const memoryEntrySchema = new mongoose.Schema({}, { strict: false, collection: 'memoryentries' });
const pluginAuthSchema = new mongoose.Schema({}, { strict: false, collection: 'pluginauths' });
const promptGroupSchema = new mongoose.Schema({}, { strict: false, collection: 'promptgroups' });
const sharedLinkSchema = new mongoose.Schema({}, { strict: false, collection: 'sharedlinks' });
const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const tokenSchema = new mongoose.Schema({}, { strict: false, collection: 'tokens' });
const sessionSchema = new mongoose.Schema({}, { strict: false, collection: 'sessions' });
const conversationSchema = new mongoose.Schema({}, { strict: false, collection: 'conversations' });
const messageSchema = new mongoose.Schema({}, { strict: false, collection: 'messages' });
const fileSchema = new mongoose.Schema({}, { strict: false, collection: 'files' });
const presetSchema = new mongoose.Schema({}, { strict: false, collection: 'presets' });
const promptSchema = new mongoose.Schema({}, { strict: false, collection: 'prompts' });
const transactionSchema = new mongoose.Schema({}, { strict: false, collection: 'transactions' });
const toolCallSchema = new mongoose.Schema({}, { strict: false, collection: 'toolcalls' });
const groupSchema = new mongoose.Schema({}, { strict: false, collection: 'groups' });

const Action =  mongoose.model('Actions', actionSchema);
const AclEntry = mongoose.model('AclEntry', aclEntrySchema);
const Agent =  mongoose.model('Agent', agentSchema);
const Assistant =  mongoose.model('Assistant', assistantSchema);
const Balance =  mongoose.model('Balance', balanceSchema);
const ConversationTag = mongoose.model('ConversationTag', conversationtagSchema);
const Key = mongoose.model('Key', keySchema);
const MemoryEntry = mongoose.model('MemoryEntry', memoryEntrySchema);
const PluginAuth = mongoose.model('PluginAuth', pluginAuthSchema);
const PromptGroup = mongoose.model('PromptGroup', promptGroupSchema);
const SharedLink = mongoose.model('SharedLink', sharedLinkSchema);
const User = mongoose.model('User', userSchema);
const Token = mongoose.model('Token', tokenSchema);
const Session = mongoose.model('Session', sessionSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);
const Message = mongoose.model('Message', messageSchema);
const File = mongoose.model('File', fileSchema);
const Preset = mongoose.model('Preset', presetSchema);
const Prompt = mongoose.model('Prompt', promptSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const ToolCall = mongoose.model('ToolCall', toolCallSchema);
const Group = mongoose.model('Group', groupSchema);

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

async function inactiveUsersOperations(warningDate, cutoffDate) {
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    //const db = mongoose.connection.db;

    // Find users to warn (10 days before deletion)
    const usersToWarn = await User.aggregate(buildUsersForWarningQuery(warningDate));

    const usersToDelete = await User.aggregate(buildUsersForDeletionQuery(cutoffDate));

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

    // DELETE USERS BEFORE CLOSING CONNECTION
    // if (usersToDelete.length > 0) {
    //   console.log(`\nDeleting ${usersToDelete.length} users...`);
    //   await deleteInactiveUsers(usersToDelete);
    //   console.log(`Successfully deleted ${usersToDelete.length} users`);
    // }

    console.log('Operation completed successfully');
    

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('Connection closed');
  }
}

async function deleteInactiveUsers(usersToDelete) {
  for (const user of usersToDelete) {
    try {
      const uid = user._id.toString();

      const tasks = [
        Action.deleteMany({ user: uid }),
        Agent.deleteMany({ author: uid }),
        Assistant.deleteMany({ user: uid }),
        Balance.deleteMany({ user: uid }),
        ConversationTag.deleteMany({ user: uid }),
        Conversation.deleteMany({ user: uid }),
        Message.deleteMany({ user: uid }),
        File.deleteMany({ user: uid }),
        Key.deleteMany({ userId: uid }),
        MemoryEntry.deleteMany({ userId: uid }),
        PluginAuth.deleteMany({ userId: uid }),
        Prompt.deleteMany({ author: uid }),
        PromptGroup.deleteMany({ author: uid }),
        Preset.deleteMany({ user: uid }),
        Session.deleteMany({ user: uid }),
        SharedLink.deleteMany({ user: uid }),
        ToolCall.deleteMany({ user: uid }),
        Token.deleteMany({ userId: uid }),
        AclEntry.deleteMany({ principalId: user._id }),
        Transaction.deleteMany({ user: uid })
      ];

      await Promise.all(tasks);
      await Group.updateMany({ memberIds: user._id }, { $pull: { memberIds: user._id } });

      // 7) Finally delete the user document itself
      await User.deleteOne({ _id: uid });

      console.log(`  ✓ Deleted user: ${user.email || user.name || uid}`); 
    }catch (error) {
      console.error(`Failed to delete user ${user.email || user.name || user._id}: ${error.message}`);
    }
    
  }
}

(async () => {
   await inactiveUsersOperations(warningDateObj, cutoffDateObj);
})();