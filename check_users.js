const mysql = require('mysql2/promise');

async function checkUsers() {
  const db = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'root',
    database: 'cybersecurity_audit'
  });
  
  try {
    const [rows] = await db.execute('SELECT id, email, full_name, role FROM users ORDER BY id');
    console.log('Users in database:');
    rows.forEach(row => {
      console.log(`ID: ${row.id}, Email: ${row.email}, Name: ${row.full_name}, Role: ${row.role}`);
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.end();
  }
}

checkUsers().catch(console.error);
