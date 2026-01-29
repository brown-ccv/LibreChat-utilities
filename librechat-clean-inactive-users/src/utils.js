
const {
  Action,
  AclEntry,
  Agent,
  Assistant,
  Balance,
  ConversationTag,
  Key,
  MemoryEntry,
  PluginAuth,
  PromptGroup,
  SharedLink,
  User,
  Token,
  Session,
  Conversation,
  Message,
  File,
  Preset,
  Prompt,
  Transaction,
  ToolCall,
  Group
} = require('./models');

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

async function deletePostgresEmbeddings(userId, pgPool) {
  const pgClient = await pgPool.connect();
  try {
    const localFiles = await File.find({ 
      user: userId, 
      source: 'vectordb' 
    }).select('file_id');

    if (localFiles.length === 0) {
      return 0;
    }

    const fileIds = localFiles.map(f => f.file_id).filter(Boolean);

    console.log(`Found ${fileIds.length} local file(s) to delete embeddings for`);

    const deleteQuery = 'DELETE FROM langchain_pg_embedding WHERE custom_id = ANY($1)';
    const result = await pgClient.query(deleteQuery, [fileIds]);
    
    console.log(`Deleted ${result.rowCount} embedding row(s) from PostgreSQL`);
    return result.rowCount;
  } catch (error) {
    console.error(`Failed to delete PostgreSQL embeddings: ${error.message}`);
    throw error;
  } finally {
    pgClient.release();
  }
}

async function deleteInactiveUsers(usersToDelete, pgPool) {
  for (const user of usersToDelete) {
    try {
      const uid = user._id.toString();

      await deletePostgresEmbeddings(uid, pgPool);

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
      await User.deleteOne({ _id: uid });

      console.log(`Deleted user: ${user.email || user.name || uid}`); 
    } catch (error) {
      console.error(`Failed to delete user ${user.email || user.name || user._id}: ${error.message}`);
    }
  }
}

module.exports = {
  buildUsersForWarningQuery,
  buildUsersForDeletionQuery,
  deleteInactiveUsers
};