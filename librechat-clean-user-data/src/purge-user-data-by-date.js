require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function purgeUserDataByDate(cutoffDate) {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(process.env.MONGO_DB_NAME);
    
    const session = client.startSession();
    
    try {
      await session.withTransaction(async () => {

        const users = await db.collection('users').find({}).toArray();
        console.log(`Found ${users.length} users:`);
        users.forEach(user => {
          console.log(`user.email: ${user.email}  user.name: ${user.name}`);
        });
        
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
    await client.close();
    console.log('Connection closed');
  }
}

// Execute the function
const cutoffDate = new Date('2024-01-01'); // Modify as needed
purgeUserDataByDate(cutoffDate);