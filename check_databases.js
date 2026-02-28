const mysql = require('mysql2/promise');

async function checkDatabases() {
  const db = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: ''
  });
  
  try {
    const [rows] = await db.execute('SHOW DATABASES');
    console.log('Available databases:');
    rows.forEach(row => {
      console.log(`- ${row.Database}`);
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.end();
  }
}

checkDatabases().catch(console.error);
