const mysql = require('mysql2');
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'N502@690',
  database: 'demo'
});
connection.connect((error) => {
  if (error) {
    console.error('Lỗi kết nối đến cơ sở dữ liệu:', error);
    return;
  }
  console.log('Kết nối thành công đến cơ sở dữ liệu MySQL Workbench!');
});
module.exports = connection;