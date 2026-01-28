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

// MongoDB URI
const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI environment variable is not set');
  process.exit(1);
}

// PostgreSQL configuration
const pgConfig = {
  host: process.env.PG_HOST,
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD
};

if (!process.env.PG_HOST || !pgConfig.database || !pgConfig.user || !pgConfig.password) {
  console.error('PostgreSQL environment variables (PG_HOST, PG_DATABASE, PG_USER, PG_PASSWORD) must be set');
  process.exit(1);
}

const pgPool = new Pool(pgConfig);

// Cutoff days configuration
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

// Calculate dates
const cutoffDateObj = new Date();
cutoffDateObj.setDate(cutoffDateObj.getDate() - daysNumber);
console.log(`Using cutoff date: ${cutoffDateObj.toISOString()} (${daysNumber} days ago)`);

const warningDateObj = new Date();
warningDateObj.setDate(warningDateObj.getDate() - (daysNumber - 10));
console.log(`Warning date: ${warningDateObj.toISOString()} (${daysNumber - 10} days ago)`);

const PDF_STORAGE_PATH = process.env.FILE_STORAGE_PATH || '/app/';
const IMAGE_STORAGE_PATH = process.env.IMAGE_STORAGE_PATH || '/app/client/public/';

async function deleteFileFromStorage(filepath, storagePath) {
  try {
    const fullPath = path.join(storagePath, filepath);
    console.log(`fullPath: ${fullPath}`)
    //await fs.access(fullPath);
    //console.log(`File found in storage: ${fullPath}`);
    //await fs.unlink(fullPath);
    //console.log(`Deleted file from storage: ${filepath}`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`File not found in storage (already deleted?): ${fullPath}`);
      return true;
    }
    console.error(`Error deleting file from storage: ${fullPath}`, error.message);
    return false;
  }
}

async function removeFileReferencesFromMessages(fileIds) {
  try {
   
    const results = await Message.find(
      { 'files.file_id': { $in: fileIds }}
    ).lean();

    console.log(`Found ${results.length} messages with file references`);
    
    // for(const message of results) {
    //   console.log(`Message ${message._id} has ${message.files?.length || 0} file(s)`);
    // }
    
    // When ready to delete, uncomment:
    // const result = await Message.updateMany(
    //   { 'files.file_id': { $in: fileIds } },
    //   { $pull: { files: { file_id: { $in: fileIds } } } }  // ✅ Correct nested pull
    // );
    // console.log(`Removed file references from ${result.modifiedCount} messages`);
    return true;
  } catch (error) {
    console.error(`Error removing file references from messages:`, error.message);
    return false;
  }
}

async function removeReferencesFromPostgres(fileIds, pgPool) {
  try {
     const pgClient = await pgPool.connect();
    try {
      // Delete rows associated with the file IDs
      // const result = await pgClient.query(
      //   'DELETE FROM langchain_pg_embedding WHERE custom_id = ANY($1::text[])',
      //   [fileIds]
      // );
      //console.log(`Deleted ${result.rowCount} embedding records from PostgreSQL`);
      
      const result = await pgClient.query(
        'SELECT collection_id, custom_id, cmetadata FROM langchain_pg_embedding WHERE custom_id = ANY($1::varchar[])',
        [fileIds]
      );
      
      console.log(`found ${result.rowCount} embedding records from PostgreSQL`);

      return result.rowCount;
    } finally {
      pgClient.release();
    }
  } catch (error) {
    console.error(`Error deleting embeddings from PostgreSQL:`, error.message);
    return 0;
  }
}

async function cleanupOldFiles(warningDate, cutoffDate) {
  try {
    // Connect to databases
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const pgClient = await pgPool.connect();
    console.log('Connected to PostgreSQL');
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


     console.log('\n=== Listing Users to warn Embeddings ===');
     console.log(`Found ${filesToWarn.length} files created on ${warningDate.toISOString().split('T')[0]}`);
    
     
    for (const file of filesToWarn){
       
        if(file.user.length > 0)
        {
          const user = file.user[0];
          console.log("=== USER TO WARN ===");
          console.log(user.email || user.name || user._id.toString());
          console.log(file.filename);
        }
    }
     
    
    // Find files older than cutoffDate
    const oldFiles = await File.find({
      createdAt: { $lt: cutoffDate },
    }).lean();
    console.log(`\nFound ${oldFiles.length} files created before ${cutoffDate.toISOString().split('T')[0]}`);
    
   
    const vectorizedFiles = oldFiles.filter(f => f.source === 'vectordb').map(f => f.file_id);
    // Delete PostgreSQL embeddings first
    if (vectorizedFiles.length > 0) {
      console.log(`\n=== Cleaning ${vectorizedFiles.length} PostgreSQL Embeddings ===`);
      await removeReferencesFromPostgres(vectorizedFiles, pgPool);
    }

    // // Clean up file references in messages
    const fileIds = oldFiles.map(f => f.file_id);
    console.log(`\n=== Cleaning ${fileIds.length} files Message References ===`);
    await removeFileReferencesFromMessages(fileIds);

    // Clean up PDF files from storage
    const localPDFPaths = oldFiles.filter(
      f => f.source === 'local' && f.type === 'application/pdf'
    ).map(f => f.filepath);
    console.log(`\n=== Cleaning PDFs ${localPDFPaths.length} From storage ===`);
    for (const filePath of localPDFPaths) {
      try {
        await deleteFileFromStorage(filePath, PDF_STORAGE_PATH);
        // delete from storage
        //const storageDeleted = await deleteFileFromStorage(file.filepath);
      
      } catch (error) {
        console.error(`  ✗ Error deleting file:`, error.message);
      }
    }

    // Clean up Images files from storage
    const localImagePaths = oldFiles.filter(
      f => f.source === 'local' && f.type === 'image/png'
    ).map(f => f.filepath);
    console.log(`\n=== Cleaning IMAGES ${localImagePaths.length} From storage ===`);
    for (const filePath of localImagePaths) {
      try {
        await deleteFileFromStorage(filePath, IMAGE_STORAGE_PATH);
        // delete from storage
        //const storageDeleted = await deleteFileFromStorage(file.filepath);
        
      } catch (error) {
        console.error(`  ✗ Error deleting file:`, error.message);
      }
    }

    // Finally delete from database    
    // console.log(`\n=== Deleting ${oldFiles.length} files from database ===`);
    // const dbResult = await File.deleteMany({
    //   _id: { $in: oldFiles.map(f => f._id) } 
    // });

    // console.log(`✓ Deleted ${dbResult.deletedCount} files from database`);

    // if (dbResult.deletedCount !== oldFiles.length) {
    //   console.log(`⚠ Warning: Expected to delete ${oldFiles.length} files, but only deleted ${dbResult.deletedCount}`);
    // }

  
    console.log('\nOperation completed successfully');

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    await pgPool.end();
    console.log('Connections closed');
  }
}

// Execute
(async () => {
  await cleanupOldFiles(warningDateObj, cutoffDateObj);
})();