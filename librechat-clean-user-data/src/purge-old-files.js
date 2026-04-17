const mongoose = require('mongoose');
const { Pool } = require('pg');
const { File,
  Message
 } = require('./models');
const {
  buildUsersForWarningQuery,
  buildUsersForDeletionQuery,
  deleteInactiveUsers
} = require('./utils');
const path = require('path');
const fs = require('fs').promises;
const winston = require('winston');

const { combine, timestamp, label, printf } = winston.format;

// Configure log manager
const logger = winston.createLogger({
  format: combine(
    label({ label: 'purge-old-files' }),
    timestamp(),
    printf(({ level, message, label, timestamp }) => {
      return `${timestamp} [${label}] ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: `logs/purge-old-files-${new Date().toISOString().split('T')[0] }.log` })
  ]
});

// check  dry-run mode 
// defaults to true unless expliciy set to false
const DRY_RUN = process.env.DRY_RUN !== 'false'; 
logger.info(`\n Running in ${DRY_RUN ? 'DRY-RUN' : 'LIVE'} mode`);
if (DRY_RUN) {
  logger.info(' No data will be deleted from the database or from the file storage\n');
} else {
  logger.info(' WARNING: This will delete data from the database!\n');
}

// connection to mongodb 
const uri = process.env.MONGO_URI;
if (!uri) {
  logger.error('MONGO_URI environment variable is not set');
  process.exit(1);
}

// PostgreSQL configuration
// This variables are set in the .env file
const pgConfig = {
  host: process.env.PG_HOST,
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD
};

if (!process.env.PG_HOST || !pgConfig.database || !pgConfig.user || !pgConfig.password) {
  logger.error('PostgreSQL environment variables (PG_HOST, PG_DATABASE, PG_USER, PG_PASSWORD) must be set');
  process.exit(1);
}

const pgPool = new Pool(pgConfig);

// Cutoff days configuration
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

const warningDateObj = new Date();
warningDateObj.setDate(warningDateObj.getDate() - (daysNumber - 10));
logger.info(`Warning date: ${warningDateObj.toISOString()} (${daysNumber - 10} days ago)`);

const PDF_STORAGE_PATH = process.env.FILE_STORAGE_PATH || '/app/';
const IMAGE_STORAGE_PATH = process.env.IMAGE_STORAGE_PATH || '/app/client/public/';

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

async function removeFileReferencesFromMessages(fileIds) {
  try {
   
    const results = await Message.find(
      { 'files.file_id': { $in: fileIds }}
    ).lean();

    logger.info(`Found ${results.length} messages with file references`);
    if (DRY_RUN === false) {
      const result = await Message.updateMany(
        { 'files.file_id': { $in: fileIds } },
        { $pull: { files: { file_id: { $in: fileIds } } } } 
      );
      logger.info(`Removed file references from ${result.modifiedCount} messages`);
    }
    
    return true;
  } catch (error) {
    logger.error(`Error removing file references from messages:`, error.message);
    return false;
  }
}

async function removeReferencesFromPostgres(fileIds, pgPool) {
  try {
     const pgClient = await pgPool.connect();
    try {

      const result = await pgClient.query(
        'SELECT collection_id, custom_id, cmetadata FROM langchain_pg_embedding WHERE custom_id = ANY($1::varchar[])',
        [fileIds]
      );
      
      logger.info(`found ${result.rowCount} embedding records from PostgreSQL`);

      if (DRY_RUN === false) {
          // Delete rows associated with the file IDs
          const result = await pgClient.query(
            'DELETE FROM langchain_pg_embedding WHERE custom_id = ANY($1::text[])',
            [fileIds]
          );
          logger.info(`Deleted ${result.rowCount} embedding records from PostgreSQL`);
      }

      return result.rowCount;
    } finally {
      pgClient.release();
    }
  } catch (error) {
    logger.error(`Error deleting embeddings from PostgreSQL:`, error.message);
    return 0;
  }
}

async function cleanupOldFiles(warningDate, cutoffDate) {
  try {
    // Connect to databases
    await mongoose.connect(uri);
    logger.info('Connected to MongoDB');

    const pgClient = await pgPool.connect();
    logger.info('Connected to PostgreSQL');
    pgClient.release();

    
    const startOfDay = new Date(warningDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(warningDate);
    endOfDay.setHours(23, 59, 59, 999);


    // Find users to warn about file deletion
    const filesToWarn = await File.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user'
        }
      }
    ]);


     logger.info('\n=== Listing Users to warn Embeddings ===');
     logger.info(`Found ${filesToWarn.length} files created on ${warningDate.toISOString().split('T')[0]}`);
    
     
    for (const file of filesToWarn){
       
        if(file.user.length > 0)
        {
          const user = file.user[0];
          logger.info("=== USER TO WARN ===");
          logger.info(user.email || user.name || user._id.toString());
          logger.info(file.filename);
        }
    }
     
    
    // Find files older than cutoffDate
    const oldFiles = await File.find({
      createdAt: { $lt: cutoffDate },
    }).lean();
    logger.info(`\nFound ${oldFiles.length} files created before ${cutoffDate.toISOString().split('T')[0]}`);
    
   
    const vectorizedFiles = oldFiles.filter(f => f.source === 'vectordb').map(f => f.file_id);
    // Delete PostgreSQL embeddings first
    if (vectorizedFiles.length > 0) {
      logger.info(`\n=== Cleaning ${vectorizedFiles.length} PostgreSQL Embeddings ===`);
      await removeReferencesFromPostgres(vectorizedFiles, pgPool);
    }

    // // Clean up file references in messages
    const fileIds = oldFiles.map(f => f.file_id);
    logger.info(`\n=== Cleaning ${fileIds.length} files Message References ===`);
    await removeFileReferencesFromMessages(fileIds);

    // Clean up PDF files from storage
    const localPDFPaths = oldFiles.filter(
      f => f.source === 'local' && f.type === 'application/pdf'
    ).map(f => f.filepath);
    logger.info(`\n=== Cleaning PDFs ${localPDFPaths.length} From storage ===`);
    for (const filePath of localPDFPaths) {
      try {
        await deleteFileFromStorage(filePath, PDF_STORAGE_PATH);
        // delete from storage
        //const storageDeleted = await deleteFileFromStorage(file.filepath);
      
      } catch (error) {
        logger.error(`  ✗ Error deleting file: ${filePath}`, error.message);
      }
    }

    // Clean up Images files from storage
    const localImagePaths = oldFiles.filter(
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

    if(DRY_RUN === false)
    {
      // Finally delete from database    
      logger.info(`\n=== Deleting ${oldFiles.length} files from database ===`);
      const dbResult = await File.deleteMany({
        _id: { $in: oldFiles.map(f => f._id) } 
      });

      logger.info(` Deleted ${dbResult.deletedCount} files from database`);

      if (dbResult.deletedCount !== oldFiles.length) {
        logger.warn(`Warning: Expected to delete ${oldFiles.length} files, but only deleted ${dbResult.deletedCount}`);
      }
    }


  
    logger.info('\nOperation completed successfully');

  } catch (error) {
    logger.error('Error:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    await pgPool.end();
    logger.info('Connections closed');
  }
}

// Execute
(async () => {
  await cleanupOldFiles(warningDateObj, cutoffDateObj);
})().catch(() => process.exit(1));