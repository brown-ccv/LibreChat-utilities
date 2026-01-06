const mongoose = require('mongoose');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI environment variable is not set');
  process.exit(1);
}

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
    await mongoose.connection.close();
    console.log('Connection closed');
  }
}

// Execute the function
const cutoffDate = new Date('2024-01-01'); // Modify as needed
purgeUserDataByDate(cutoffDate);