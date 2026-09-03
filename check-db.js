const mysql = require('mysql2/promise');

(async () => {
  try {
    const connection = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: ''
    });
    
    console.log('✓ Connected to MariaDB');
    
    const [rows] = await connection.execute('SHOW DATABASES LIKE "smart_parking"');
    console.log('Database check result:', rows);
    
    if (rows.length === 0) {
      console.log('Creating smart_parking database...');
      await connection.execute('CREATE DATABASE smart_parking');
      console.log('✓ Database created');
    } else {
      console.log('✓ Database smart_parking already exists');
    }
    
    await connection.end();
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
