const mongoose = require('mongoose');
const { Pool } = require('pg');
const { User } = require('./models');
const {
  buildUsersForWarningQuery,
  buildUsersForDeletionQuery,
  deleteInactiveUsers
} = require('./utils');

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


async function inactiveUsersOperations(warningDate, cutoffDate) {
  try {
    // Connect to databases
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const pgClient = await pgPool.connect();
    console.log('Connected to PostgreSQL');
    pgClient.release();

    // Find users
    const usersToWarn = await User.aggregate(buildUsersForWarningQuery(warningDate));
    const usersToDelete = await User.aggregate(buildUsersForDeletionQuery(cutoffDate));

    // Display users to warn
    console.log('=== USERS TO WARN ===');
    console.log(`Found ${usersToWarn.length} users (last activity on ${warningDate.toISOString().split('T')[0]}):`);
    console.log('---');
    for (const user of usersToWarn) {
      console.log(`User: ${user.email || user.name || user._id}`);
      console.log(` Last activity: ${user.lastActivityDate ? new Date(user.lastActivityDate).toISOString() : 'No activity'}`);
      console.log(` Send warning email`);
      console.log('---');
    }

    // Display users to delete
    console.log('=== USERS TO DELETE ===');
    console.log(`Found ${usersToDelete.length} users (inactive 180+ days):`);
    console.log('---');
    for (const user of usersToDelete) {
      console.log(`User: ${user.email || user.name || user._id}`);
      console.log(` Last activity: ${user.lastActivityDate ? new Date(user.lastActivityDate).toISOString() : 'No activity'}`);
      console.log(` Candidate for deletion`);
      console.log('---');
    }

    // Delete users
    if (usersToDelete.length > 0) {
      console.log(`Deleting ${usersToDelete.length} users`);
      await deleteInactiveUsers(usersToDelete, pgPool);
      console.log(`Successfully deleted ${usersToDelete.length} users`);
    }

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
  await inactiveUsersOperations(warningDateObj, cutoffDateObj);
})();