#!/usr/bin/env node
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
const path = require('path');
const mongoose = require('mongoose');
const {
    Key,
    User,
    File,
    Agent,
    Token,
    Group,
    Action,
    Preset,
    Prompt,
    Balance,
    Message,
    Session,
    AclEntry,
    ToolCall,
    Assistant,
    SharedLink,
    PluginAuth,
    MemoryEntry,
    PromptGroup,
    AgentApiKey,
    Transaction,
    Conversation,
    ConversationTag,
} = require('./models');
const fs = require('fs').promises;
const {
  buildUsersForWarningQuery,
  buildUsersForDeletionQuery,
  deleteInactiveUsers
} = require('./utils');
//require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
//const connect = require('./connect');

const winston = require('winston');
const { combine, label, timestamp, printf } = winston.format;

// Configure log manager
const logger = winston.createLogger({
    format: combine(
        label({ label: 'clean-innactive-users' }),
        timestamp(),
        printf(({ level, message, label, timestamp }) => {
            return `${timestamp} [${label}] ${level}: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: `logs/clean-innactive-users-${new Date().toISOString().split('T')[0]}.log` })
    ]
});

const DRY_RUN = process.env.DRY_RUN !== 'false';
logger.info(`\n Running in ${DRY_RUN ? 'DRY-RUN' : 'LIVE'} mode`);
if (DRY_RUN) {
    logger.info(' No user will be deleted from the database\n');
} else {
    logger.info(' WARNING: This will delete users from the database!\n');
}

// connection to mongodb 
const uri = process.env.MONGO_URI;
if (!uri) {
    logger.error('MONGO_URI environment variable is not set');
    process.exit(1);
}

const PDF_STORAGE_PATH = process.env.FILE_STORAGE_PATH || '/app/';
const IMAGE_STORAGE_PATH = process.env.IMAGE_STORAGE_PATH || '/app/client/public/';


const cutoffDays = process.env.CUTOFF_DAYS;
if (!cutoffDays) {
  logger.error('CUTOFF_DAYS environment variable is not set');
  process.exit(1);
}

const daysNumber = parseInt(cutoffDays, 10);
if (isNaN(daysNumber) || daysNumber <= 0) {
  logger.error('CUTOFF_DAYS must be a positive number of days');
  process.exit(1);
}

// Calculate dates
const cutoffDateObj = new Date();
cutoffDateObj.setDate(cutoffDateObj.getDate() - daysNumber);
logger.info(`Using cutoff date: ${cutoffDateObj.toISOString()} (${daysNumber} days ago)`);



async function deleteFileFromStorage(filepath, storagePath) {
  try {
    const fullPath = path.join(storagePath, filepath);
    logger.info(`fullPath: ${fullPath}`)
    await fs.access(fullPath);
    logger.info(`File found in storage: ${fullPath}`);
    if (DRY_RUN === false){
      await fs.unlink(fullPath);
      logger.info(`Deleted file from storage: ${filepath}`);
    }
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.warn(`File not found in storage (already deleted?): ${fullPath}`);
      return true;
    }
    logger.error(`Error deleting file from storage: ${fullPath}`, error.message);
    return false;
  }
}

async function gracefulExit(code = 0) {
    try {
        await mongoose.disconnect();
    } catch (err) {
        logger.error('Error disconnecting from MongoDB:', err);
    }
    process.exit(code);
}

(async () => {
    await mongoose.connect(uri);

    const usersToDelete = await User.aggregate(buildUsersForDeletionQuery(cutoffDateObj));

    logger.info('---------------');
    logger.info('Deleting a user and all related data');
    logger.info('---------------');
    for (const user of usersToDelete) {
        const deleteTx = true;

        const uid = user._id.toString();

        const userFiles = await File.find({ user: uid });

        // Clean up PDF files from storage
        const localPDFPaths = userFiles.filter(
        f => f.source === 'local' && f.type === 'application/pdf'
        ).map(f => f.filepath);
        logger.info(`\n=== Cleaning PDFs ${localPDFPaths.length} From storage ===`);
        for (const filePath of localPDFPaths) {
        try {
            await deleteFileFromStorage(filePath, PDF_STORAGE_PATH);
        
        } catch (error) {
            logger.error(`  ✗ Error deleting file: ${filePath}`, error.message);
        }
        }

        // Clean up Images files from storage
        const localImagePaths = userFiles.filter(
        f => f.source === 'local' && f.type === 'image/png'
        ).map(f => f.filepath);
        logger.info(`\n=== Cleaning IMAGES ${localImagePaths.length} From storage ===`);
        for (const filePath of localImagePaths) {
        try {
            // delete from storage
            await deleteFileFromStorage(filePath, IMAGE_STORAGE_PATH);      
            
        } catch (error) {
            logger.error(`  ✗ Error deleting file: ${filePath}`, error.message);
        }
        }

        // 5) Build and run deletion tasks
        if (!DRY_RUN) {
            const tasks = [
                Action.deleteMany({ user: uid }),
                Agent.deleteMany({ author: uid }),
                AgentApiKey.deleteMany({ user: uid }),
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
            ];

            if (deleteTx) {
                tasks.push(Transaction.deleteMany({ user: uid }));
            }

            await Promise.all(tasks);

            // 6) Remove user from all groups
            await Group.updateMany({ memberIds: user._id }, { $pull: { memberIds: user._id } });

            // 7) Finally delete the user document itself
            await User.deleteOne({ _id: uid });

            logger.info(`Successfully deleted user ${user.email} and all associated data.`);
            if (!deleteTx) {
                logger.warn('Transaction history was retained.');
            }
        } else {
            logger.info(`[DRY-RUN] Would have deleted user ${user.email} and all associated data.`);
        }
    }
    
    

    

    return gracefulExit(0);
})().catch(async (err) => {
    if (!err.message.includes('fetch failed')) {
        logger.error('There was an uncaught error:');
        logger.error(err);
        await mongoose.disconnect();
        process.exit(1);
    }
});
