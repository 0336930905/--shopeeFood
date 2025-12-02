const db = require('./db');
const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const bcrypt = require('bcrypt');
const sgMail = require('@sendgrid/mail');
const crypto = require('crypto'); // Để tạo mã ngẫu nhiên
const nodemailer = require('nodemailer'); // Thư viện gửi email
const flash = require('connect-flash');
const app = express();

// Cấu hình session middleware
app.use(session({
  secret: 'secret-key', // Khóa bí mật để mã hóa phiên
  resave: false,
  saveUninitialized: false
}));

// Cấu hình thư mục tĩnh cho CSS và ảnh
app.use(express.static(path.join(__dirname, 'public')));
// Kích hoạt connect-flash
app.use(flash());
// Truyền thông báo từ flash vào biến cục bộ cho view
app.use((req, res, next) => {
  res.locals.message = req.flash('messages');
  next();
});
// Cấu hình EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: false }));

// Cấu hình multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });
// Cấu hình Nodemailer với tài khoản Gmail của bạn
// Hàm tạo mã xác nhận ngẫu nhiên gồm 6 chữ số
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // Tạo số ngẫu nhiên 6 chữ số
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'nhhaoa20135@cusc.ctu.edu.vn', // Địa chỉ Gmail của bạn
    pass: 'axkh jrzi ugii cxfu'    // Mật khẩu ứng dụng của Google (16 ký tự)
  }
});




// Trang chủ
app.get('/', (req, res) => {
  // Truy vấn sản phẩm
  const productQuery = `
      SELECT 
          sp.ANH_SP,
          sp.TEN_SP,
          sp.GIA_SP,
          sp.ID_SP,
          dm.TEN_DM
      FROM 
          sanpham sp
      JOIN 
          danhmuc dm ON sp.ID_DM = dm.ID_DM
      WHERE 
          sp.TRANGTHAI_SP = 'Còn';
  `;

  // Truy vấn trangchu
  const trangChuQuery = 'SELECT * FROM trangchu';

  // Thực hiện truy vấn sản phẩm trước
  db.query(productQuery, (err, productResults) => {
    if (err) throw err;

    // Sau khi lấy được dữ liệu sản phẩm, tiếp tục truy vấn dữ liệu trangchu
    db.query(trangChuQuery, (err, trangChuResults) => {
      if (err) throw err;

      // Tổ chức dữ liệu sản phẩm theo danh mục
      const productsByCategory = productResults.reduce((acc, product) => {
        if (!acc[product.TEN_DM]) {
          acc[product.TEN_DM] = [];
        }
        acc[product.TEN_DM].push(product);
        return acc;
      }, {});

      // Render view và truyền dữ liệu từ cả hai truy vấn vào
      res.render('trangchu', {
        productsByCategory,
        trangChuData: trangChuResults
      });
    });
  });
});
// Route tìm kiếm sản phẩm
app.get('/timkiem', (req, res) => {
  const keyword = req.query.keyword;
  const query = `SELECT * FROM sanpham WHERE TEN_SP LIKE ?`;

  db.query(query, [`%${keyword}%`], (err, results) => {
    if (err) {
      console.log(err);
      return res.sendStatus(500);
    }
    res.render('trangchu', { products: results, highlightedProduct: null });
  });
});
// Đường dẫn đến trang đăng ký
app.post('/dangky', async (req, res) => {
  const { TEN_KH, TAIKHOAN_KH, MATKHAU_KH } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(MATKHAU_KH, 10);

    const query = `
      INSERT INTO khachhang (TEN_KH, TAIKHOAN_KH, MATKHAU_KH) 
      VALUES ( ?, ?, ?)
    `;

    db.query(query, [TEN_KH, TAIKHOAN_KH, hashedPassword, TAIKHOAN_KH], (err, result) => {
      if (err) {
        console.error('Error inserting customer:', err);
        return res.status(500).send('Đã xảy ra lỗi khi đăng ký tài khoản.');
      }

      res.render('dangnhap', { successMessage: 'Đăng ký tài khoản thành công!' });
    });
  } catch (err) {
    console.error('Error during registration:', err);
    res.status(500).send('Đã xảy ra lỗi khi đăng ký tài khoản.');
  }
});
// GET request để hiển thị trang đăng nhập
app.get('/dangnhap', (req, res) => {
  res.render('dangnhap'); // Render trang EJS 'dangnhap' để người dùng điền thông tin đăng nhập
});
// quên mật khẩu

// Route để đăng xuất
app.get('/dangxuat', (req, res) => {
  // Hủy bỏ phiên làm việc của người dùng
  req.session.destroy((err) => {
    if (err) {
      console.error('Lỗi khi hủy bỏ phiên làm việc:', err);
      return res.send('Đã xảy ra lỗi. Vui lòng thử lại sau.');
    }
    // Chuyển hướng người dùng đến trang đăng nhập
    res.redirect('/dangnhap');
  });
});
app.post('/dangnhap', async (req, res) => {
  const { taiKhoan, matKhau } = req.body;

  try {
    // Kiểm tra tài khoản trong bảng NHANVIEN
    let sql = 'SELECT * FROM NHANVIEN JOIN CHUCVU ON NHANVIEN.ID_CV = CHUCVU.ID_CV WHERE TAIKHOAN_NV = ?';
    let values = [taiKhoan];
    
    db.query(sql, values, async (err, result) => {
      if (err) {
        console.error('Lỗi truy vấn cơ sở dữ liệu:', err);
        return res.render('dangnhap', { errorMessage: 'Đã xảy ra lỗi. Vui lòng thử lại sau.' });
      }

      if (result.length > 0) { // Nếu là nhân viên
        const nhanVien = result[0];
        const isMatch = await bcrypt.compare(matKhau, nhanVien.MATKHAU_NV);

        if (isMatch) {
          const chucVu = nhanVien.TEN_CV;
          req.session.loggedInEmployeeName = nhanVien.HOTEN_NV;
          req.session.idNhanVien = nhanVien.ID_NV;

          if (chucVu === 'Nhân viên') {
            return res.render('nhanvien', { successMessage: 'Đăng nhập thành công!' });
          } else if (chucVu === 'Quản lý') {
            return res.render('quanly', { successMessage: 'Đăng nhập thành công!' });
          } else {
            return res.render('dangnhap', { errorMessage: 'Chức vụ không hợp lệ.' });
          }
        } else {
          return res.render('dangnhap', { errorMessage: 'Tài khoản hoặc mật khẩu không đúng.' });
        }
      } else { // Nếu không phải là nhân viên, kiểm tra trong bảng KHACHHANG
        sql = 'SELECT * FROM KHACHHANG WHERE TAIKHOAN_KH = ?';
        values = [taiKhoan];

        db.query(sql, values, async (err, result) => {
          if (err) {
            console.error('Lỗi truy vấn cơ sở dữ liệu:', err);
            return res.render('dangnhap', { errorMessage: 'Đã xảy ra lỗi. Vui lòng thử lại sau.' });
          }

          if (result.length > 0) { // Nếu là khách hàng
            const khachHang = result[0];
            const isMatch = await bcrypt.compare(matKhau, khachHang.MATKHAU_KH);

            if (isMatch) {
              req.session.idKhachHang = khachHang.ID_KH;

              let sqlSanPham = 'SELECT * FROM SANPHAM';
              let sqlNguyenLieu = 'SELECT * FROM NGUYENLIEU';

              db.query(sqlSanPham, (errSanPham, sanphamList) => {
                if (errSanPham) {
                  console.error('Lỗi truy vấn cơ sở dữ liệu (sản phẩm):', errSanPham);
                  return res.render('dangnhap', { errorMessage: 'Đã xảy ra lỗi khi lấy danh sách sản phẩm.' });
                }
                db.query(sqlNguyenLieu, (errNguyenLieu, nguyenlieuList) => {
                  if (errNguyenLieu) {
                    console.error('Lỗi truy vấn cơ sở dữ liệu (nguyên liệu):', errNguyenLieu);
                    return res.render('dangnhap', { errorMessage: 'Đã xảy ra lỗi khi lấy danh sách nguyên liệu.' });
                  }
                  return res.render('khachhang', { sanphamList, nguyenlieuList, successMessage: 'Đăng nhập thành công!' });
                });
              });
            } else {
              return res.render('dangnhap', { errorMessage: 'Tài khoản hoặc mật khẩu không đúng.' });
            }
          } else {
            return res.render('dangnhap', { errorMessage: 'Tài khoản hoặc mật khẩu không đúng.' });
          }
        });
      }
    });
  } catch (error) {
    console.error('Lỗi truy vấn cơ sở dữ liệu:', error);
    return res.render('dangnhap', { errorMessage: 'Đã xảy ra lỗi. Vui lòng thử lại sau.' });
  }
});
app.get('/quenmatkhau', (req, res) => {
  // Nếu có thông báo về quên mật khẩu hoặc xác nhận mật khẩu, sẽ hiển thị thông báo tương ứng
  res.render('quenmatkhau', { 
    message1: null, // Thông báo từ quá trình quên mật khẩu (lấy mã xác nhận)
    success1: null,
    message2: null, // Thông báo từ quá trình xác nhận mật khẩu
    success2: null 
  });
});

app.post('/quenmatkhau', (req, res) => {
  const email = req.body.email;

  db.query('SELECT * FROM khachhang WHERE GMAIL_KH = ?', [email], (err, result) => {
    if (err) {
      console.log(err);
      return res.render('quenmatkhau', { 
        message1: 'Đã xảy ra lỗi, vui lòng thử lại.', 
        success1: false,
        message2: null, 
        success2: null 
      });
    }

    if (result.length > 0) {
      const khachHang = result[0];
      const code = generateCode();

      const mailOptions = {
        from: 'haohaon502@gmail.com',
        to: khachHang.GMAIL_KH,
        subject: 'Mã xác nhận khôi phục mật khẩu',
        text: `Mã xác nhận của bạn là: ${code}`
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.log(error);
          return res.render('quenmatkhau', { 
            message1: 'Không thể gửi email, vui lòng thử lại.', 
            success1: false,
            message2: null, 
            success2: null 
          });
        }

        db.query('INSERT INTO khoi_phuc_mat_khau (GMAIL_KPMK, CODE_KPMK) VALUES (?, ?)', [email, code], (err, result) => {
          if (err) {
            console.log(err);
            return res.render('quenmatkhau', { 
              message1: 'Đã xảy ra lỗi khi lưu mã xác nhận, vui lòng thử lại.', 
              success1: false,
              message2: null, 
              success2: null 
            });
          }

          return res.render('quenmatkhau', { 
            message1: 'Mã xác nhận đã được gửi đến email của bạn.', 
            success1: true,
            message2: null, 
            success2: null 
          });
        });
      });
    } else {
      return res.render('quenmatkhau', { 
        message1: 'Email không tồn tại trong hệ thống.', 
        success1: false,
        message2: null, 
        success2: null 
      });
    }
  });
});

app.post('/xacnhanmatkhau', async (req, res) => {
  const { code, new_password, confirm_password } = req.body;

  db.query('SELECT * FROM khoi_phuc_mat_khau WHERE CODE_KPMK = ?', [code], async (err, result) => {
    if (err) {
      console.log(err);
      return res.render('quenmatkhau', { 
        message2: 'Đã xảy ra lỗi, vui lòng thử lại.', 
        success2: false,
        message1: null, 
        success1: null
      });
    }

    if (result.length === 0) {
      return res.render('quenmatkhau', { 
        message2: 'Mã xác nhận không hợp lệ.', 
        success2: false,
        message1: null, 
        success1: null 
      });
    }

    if (new_password !== confirm_password) {
      return res.render('quenmatkhau', { 
        message2: 'Mật khẩu không khớp. Vui lòng thử lại.', 
        success2: false,
        message1: null, 
        success1: null 
      });
    }

    const email = result[0].GMAIL_KPMK;

    try {
      const hashedPassword = await bcrypt.hash(new_password, 10);

      db.query('UPDATE khachhang SET MATKHAU_KH = ? WHERE GMAIL_KH = ?', [hashedPassword, email], (err, result) => {
        if (err) {
          console.log(err);
          return res.render('quenmatkhau', { 
            message2: 'Đã xảy ra lỗi khi cập nhật mật khẩu.', 
            success2: false,
            message1: null, 
            success1: null 
          });
        }

        if (result.affectedRows === 0) {
          return res.render('quenmatkhau', { 
            message2: 'Không tìm thấy người dùng để cập nhật mật khẩu.', 
            success2: false,
            message1: null, 
            success1: null 
          });
        }

        db.query('DELETE FROM khoi_phuc_mat_khau WHERE GMAIL_KPMK = ?', [email], (err) => {
          if (err) {
            console.log(err);
            return res.render('quenmatkhau', { 
              message2: 'Đã xảy ra lỗi khi xóa mã xác nhận.', 
              success2: false,
              message1: null, 
              success1: null 
            });
          }
          return res.render('quenmatkhau', { 
            message2: 'Mật khẩu của bạn đã được cập nhật thành công.', 
            success2: true,
            message1: null, 
            success1: null 
          });
        });
      });
    } catch (err) {
      console.log(err);
      return res.render('quenmatkhau', { 
        message2: 'Đã xảy ra lỗi khi băm mật khẩu.', 
        success2: false,
        message1: null, 
        success1: null 
      });
    }
  });
});

// Định tuyến GET cho trang Quản lý lịch làm
app.get('/quanly/sapxepvieclam', (req, res) => {
  // Truy vấn lấy danh sách đăng ký ngày làm và thông tin nhân viên
  const selectDangKyNgayLamQuery = `
    SELECT dangky.*, nhanvien.HOTEN_NV
    FROM DANGKYNGAYLAM dangky
    JOIN NHANVIEN nhanvien ON dangky.ID_NV = nhanvien.ID_NV
  `;

  db.query(selectDangKyNgayLamQuery, (err, dangKyResults) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Lỗi khi truy vấn danh sách Đăng ký ngày làm');
    }

    // Truy vấn lấy danh sách ngày
    const selectNgayQuery = 'SELECT * FROM ngay WHERE NGAY_KT >= CURRENT_DATE;';

    db.query(selectNgayQuery, (err, ngayResults) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Lỗi khi truy vấn danh sách Ngày');
      }

      // Truy vấn lấy danh sách lịch làm
      const selectLichLamQuery = `
      SELECT 
    lichlam.*, 
    nv1.HOTEN_NV AS TEN_NV_CA_1, 
    nv2.HOTEN_NV AS TEN_NV_CA_2, 
    nv3.HOTEN_NV AS TEN_NV_CA_3
FROM 
    lichlam
JOIN 
    ngay ON lichlam.ID_N = ngay.ID_N
LEFT JOIN 
    nhanvien nv1 ON lichlam.CA_1 = nv1.ID_NV
LEFT JOIN 
    nhanvien nv2 ON lichlam.CA_2 = nv2.ID_NV
LEFT JOIN 
    nhanvien nv3 ON lichlam.CA_3 = nv3.ID_NV
WHERE 
    ngay.NGAY_KT >= CURRENT_DATE;
      `;

      // Truy vấn lấy danh sách nhân viên
      const selectNhanVienQuery = 'SELECT ID_NV, HOTEN_NV FROM nhanvien';

      db.query(selectLichLamQuery, (err, lichLamResults) => {
        if (err) {
          console.error(err);
          return res.status(500).send('Lỗi khi truy vấn danh sách Lịch làm');
        }

        db.query(selectNhanVienQuery, (err, nhanVienResults) => {
          if (err) {
            console.error(err);
            return res.status(500).send('Lỗi khi truy vấn danh sách Nhân viên');
          }

          // Render view với tất cả dữ liệu
          res.render('quanly/sapxepvieclam', {
            dangKyNgayLamList: dangKyResults,
            ngayList: ngayResults,
            lichLamList: lichLamResults,
            nhanVienList: nhanVienResults
          });
        });
      });
    });
  });
});
app.post('/quanly/sapxepvieclam/capnhatlichlam', (req, res) => {
  const updates = [];

  Object.keys(req.body).forEach(key => {
    if (key.startsWith('ca_1_') || key.startsWith('ca_2_') || key.startsWith('ca_3_')) {
      const id = key.split('_')[2];
      const ca_field = `CA_${key.split('_')[1]}`; // Sửa lỗi ở đây
      const id_nv = req.body[key] || null; // Nếu giá trị là rỗng thì đặt null

      const updateQuery = `
        UPDATE lichlam 
        SET ${ca_field} = ?
        WHERE ID_LL = ?
      `;

      updates.push(new Promise((resolve, reject) => {
        db.query(updateQuery, [id_nv, id], (err) => {
          if (err) return reject(err);
          resolve();
        });
      }));
    }
  });

  Promise.all(updates)
    .then(() => {
      res.redirect('/quanly/sapxepvieclam');
    })
    .catch(err => {
      console.error(err);
      res.status(500).send('Có lỗi xảy ra');
    });
});
app.get('/quanly/sapxepvieclam/timkiem', (req, res) => {
  const selectedDate = req.query.ngay_l; // YYYY-MM-DD

  const selectDangKyNgayLamQuery = `
    SELECT dangky.*, nhanvien.HOTEN_NV
    FROM DANGKYNGAYLAM dangky
    JOIN NHANVIEN nhanvien ON dangky.ID_NV = nhanvien.ID_NV
  `;

  db.query(selectDangKyNgayLamQuery, (err, dangKyResults) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Lỗi khi truy vấn danh sách Đăng ký ngày làm');
    }

    // Truy vấn các dữ liệu khác nếu cần
    const selectNgayQuery = 'SELECT * FROM ngay WHERE NGAY_KT >= CURRENT_DATE;';

    db.query(selectNgayQuery, (err, ngayResults) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Lỗi khi truy vấn danh sách Ngày');
      }

      // Truy vấn lịch làm dựa trên selectedDate
      const selectLichLamQuery = `
        SELECT 
          lichlam.*, 
          nv1.HOTEN_NV AS TEN_NV_CA_1, 
          nv2.HOTEN_NV AS TEN_NV_CA_2, 
          nv3.HOTEN_NV AS TEN_NV_CA_3
        FROM 
          lichlam
        LEFT JOIN 
          nhanvien nv1 ON lichlam.CA_1 = nv1.ID_NV
        LEFT JOIN 
          nhanvien nv2 ON lichlam.CA_2 = nv2.ID_NV
        LEFT JOIN 
          nhanvien nv3 ON lichlam.CA_3 = nv3.ID_NV
        WHERE 
          lichlam.NGAY_L = ?;
      `;

      db.query(selectLichLamQuery, [selectedDate], (err, lichLamResults) => {
        if (err) {
          console.error(err);
          return res.status(500).send('Lỗi khi truy vấn danh sách Lịch làm');
        }

        // Render view với tất cả dữ liệu
        res.render('quanly/sapxepvieclam', {
          dangKyNgayLamList: dangKyResults,
          ngayList: ngayResults,
          lichLamList: lichLamResults,
          selectedDate: selectedDate // Truyền thêm ngày đã chọn nếu cần sử dụng lại trong view
        });
      });
    });
  });
});
// Route để xử lý yêu cầu POST từ form xóa ngày

app.post('/quanly/sapxepvieclam/xoa-ngay', (req, res) => {
  const ngayId = req.body.ngayId;

  // Kiểm tra nếu ngayId tồn tại trong bảng lichLam
  const checkQuery = 'SELECT * FROM LICHLAM WHERE ID_N = ?';

  db.query(checkQuery, [ngayId], (checkError, checkResults) => {
    if (checkError) {
      console.error('Lỗi truy vấn kiểm tra: ' + checkError.stack);
      return res.send('<script>alert("Đã xảy ra lỗi khi kiểm tra lịch làm."); </script>');
    }

    if (checkResults.length > 0) {
      // Nếu ngayId tồn tại trong bảng lichLam
      return res.send(`
        <script>
          alert("Lịch làm đã được xác nhận, không thể xóa.");
          window.location.href = "http://localhost:3000/quanly/sapxepvieclam";
        </script>
      `);
    }

    // Nếu ngayId không tồn tại trong bảng lichLam, thực hiện xóa
    const deleteQuery = 'DELETE FROM NGAY WHERE ID_N = ?';

    db.query(deleteQuery, [ngayId], (deleteError, deleteResults) => {
      if (deleteError) {
        console.error('Lỗi truy vấn xóa: ' + deleteError.stack);
        return res.send('<script>alert("Đã xảy ra lỗi khi xóa ngày."); </script>');
      }
      res.redirect('/quanly/sapxepvieclam');
    });
  });
});
app.post('/quanly/sapxepvieclam', (req, res) => {
  const data = req.body;
  // Lấy ngày bắt đầu và ngày kết thúc từ form
  const ngayBD = new Date(data.ngayBD);
  const ngayKT = new Date(data.ngayKT);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Kiểm tra ngày kết thúc không vượt quá 7 ngày từ ngày bắt đầu
  const maxEndDate = new Date(ngayBD);
  maxEndDate.setDate(maxEndDate.getDate() + 7);

  if (ngayKT > maxEndDate) {
    return res.send('<script>alert("Ngày kết thúc không được vượt quá 7 ngày kể từ ngày bắt đầu."); </script>');
  }

  // Hàm để định dạng lại ngày từ "yyyy-mm-dd" sang "yyyy-mm-dd"
  function formatDateToYMD(dateStr) {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Lấy ID_N từ form
  const idN = data.id_n;

  // Lấy danh sách các ngày và ca làm việc
  let records = [];
  for (let i = 1; i <= 7; i++) {
    const ngay = data[`ngay${i}`];
    const ca1 = data[`ca1_N${i}`] || null;
    const ca2 = data[`ca2_N${i}`] || null;
    const ca3 = data[`ca3_N${i}`] || null;
    const formattedNgay = formatDateToYMD(ngay);

    if (formattedNgay) {
      records.push({
        NGAY_L: formattedNgay,
        CA_1: ca1,
        CA_2: ca2,
        CA_3: ca3,
        ID_N: idN
      });
    }
  }

  if (records.length === 0) {
    return res.send('<script>alert("Không có ngày hợp lệ để chèn."); </script>');
  }

  // Chuỗi truy vấn kiểm tra sự tồn tại của các ngày
  const checkQuery = `SELECT * FROM lichlam WHERE NGAY_L IN (?) AND ID_N = ?`;

  // Thực thi truy vấn kiểm tra
  db.query(checkQuery, [records.map(record => record.NGAY_L), idN], (checkError, checkResults) => {
    if (checkError) {
      console.error('Lỗi truy vấn kiểm tra: ' + checkError.stack);
      return res.send('<script>alert("Đã xảy ra lỗi khi kiểm tra lịch làm."); </script>');
    }

    if (checkResults.length > 0) {
      return res.send(`
        <script>
          alert("Một hoặc nhiều ngày làm đã tồn tại. Không thể tạo mới.");
          window.location.href = "/quanly/sapxepvieclam";
        </script>
      `);
    }

    // Tạo câu lệnh INSERT với dữ liệu đã chuẩn bị
    const values = records.map(record => `(?, ?, ?, ?, ?)`).join(',');
    const flatValues = records.flatMap(record => [record.NGAY_L, record.CA_1, record.CA_2, record.CA_3, record.ID_N]);

    const query = `
      INSERT INTO lichlam (NGAY_L, CA_1, CA_2, CA_3, ID_N) VALUES ${values}
    `;

    db.query(query, flatValues, (error, results, fields) => {
      if (error) {
        console.error('Lỗi truy vấn: ' + error.stack);
        return res.send('<script>alert("Đã xảy ra lỗi khi thêm mới lịch làm.");window.location.href = "/quanly/sapxepvieclam"; </script>');
      }
      console.log('Dữ liệu đã được lưu thành công vào cơ sở dữ liệu.');
      res.redirect('/quanly/sapxepvieclam');
    });
  });
});
app.get('/quanly/quanlydanhgia', (req, res) => {
  const query = 'SELECT DANHGIA.ID_DG, KHACHHANG.TEN_KH, SANPHAM.TEN_SP, DANHGIA.HANG_DG, DANHGIA.BINHLUAN_DG, DANHGIA.NGAY_DG FROM DANHGIA JOIN KHACHHANG ON DANHGIA.ID_KH = KHACHHANG.ID_KH JOIN SANPHAM ON DANHGIA.ID_SP = SANPHAM.ID_SP';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Lỗi khi lấy danh sách đánh giá:', err);
      return res.status(500).send('Đã xảy ra lỗi khi lấy danh sách đánh giá.');
    }
    res.render('quanly/quanlydanhgia', { reviews: results });
  });
});
app.post('/quanly/quanlydanhgia/xoa/:id', (req, res) => {
  const reviewId = req.params.id;
  const query = 'DELETE FROM DANHGIA WHERE ID_DG = ?';
  db.query(query, [reviewId], (err, result) => {
    if (err) {
      console.error('Lỗi khi xóa đánh giá:', err);
      return res.status(500).send('Đã xảy ra lỗi khi xóa đánh giá.');
    }
    res.redirect('/quanly/quanlydanhgia');
  });
});
// GET /quanly/quanlytaikhoan_kh - Xem danh sách tài khoản khách hàng
app.get('/quanly/quanlytaikhoan_kh', (req, res) => {
  const query = 'SELECT * FROM khachhang';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Lỗi khi lấy dữ liệu khách hàng:', err);
      return res.status(500).send('Đã xảy ra lỗi khi tải dữ liệu khách hàng.');
    }
    res.render('quanly/quanlytaikhoan_kh', { customers: results });
  });
});

// POST /quanly/khoataikhoan/:id - Khóa/mở khóa tài khoản khách hàng
app.post('/quanly/khoataikhoan/:id', (req, res) => {
  const customerId = req.params.id;
  const { KHOA_TAIKHOAN } = req.body;

  const query = 'UPDATE khachhang SET KHOA_TAIKHOAN = ? WHERE ID_KH = ?';

  db.query(query, [KHOA_TAIKHOAN, customerId], (err) => {
    if (err) {
      console.error('Lỗi khi cập nhật trạng thái khóa tài khoản:', err);
      return res.status(500).send('Đã xảy ra lỗi khi cập nhật trạng thái khóa tài khoản.');
    }

    res.redirect('/quanly/quanlytaikhoan_kh');
  });
});
function createValues(data) {
  let values = '';

  // Hàm để định dạng lại ngày từ "dd/mm/yyyy" sang "yyyy-mm-dd"
  function formatDateToYMD(dateStr) {
    if (!dateStr) return null; // Kiểm tra chuỗi ngày có tồn tại
    const [day, month, year] = dateStr.split('/'); // Tách chuỗi ngày
    // Chuyển đổi thành định dạng "yyyy-mm-dd"
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  for (let i = 1; i <= 7; i++) {
    const ngay = data[`ngay${i}`]; // Lấy chuỗi ngày dạng "dd/mm/yyyy"
    const formattedNgay = formatDateToYMD(ngay); // Định dạng lại thành "yyyy-mm-dd"

    if (!formattedNgay) {
      // Nếu ngày không hợp lệ hoặc không định dạng được
      console.error(`Ngày không hợp lệ: ${ngay}`);
      continue; // Bỏ qua mục này
    }

    const ca1 = data[`ca1_N${i}`] || null;
    const ca2 = data[`ca2_N${i}`] || null;
    const ca3 = data[`ca3_N${i}`] || null;
    const id_n = data[`id_n${i}`] || null;

    // Thêm các giá trị vào chuỗi
    values += `('${formattedNgay}', '${ca1}', '${ca2}', '${ca3}', ${id_n}), `;
  }

  // Loại bỏ dấu phẩy cuối cùng
  values = values.slice(0, -2);
  return values;
}
const moment = require('moment');

app.post('/quanly/sapxepvieclam/taomoi', (req, res) => {
  const ngayBD = moment(req.body.ngayBD, 'YYYY-MM-DD');
  const ngayKT = moment(req.body.ngayKT, 'YYYY-MM-DD');

  if (ngayKT.isBefore(ngayBD)) {
    res.status(400).send('Ngày kết thúc không được nhỏ hơn ngày bắt đầu');
    return;
  }

  // SQL query to check for conflicts
  const checkConflictQuery = `
    SELECT * FROM ngay
    WHERE (NGAY_BD <= ? AND NGAY_KT >= ?)
       OR (NGAY_BD <= ? AND NGAY_KT >= ?)
       OR (NGAY_BD >= ? AND NGAY_KT <= ?)
    FOR UPDATE;
  `;

  // SQL query to insert new schedule
  const createScheduleQuery = `
    INSERT INTO ngay (NGAY_BD, NGAY_KT)
    VALUES (?, ?);
  `;

  // Begin transaction
  db.beginTransaction(err => {
    if (err) {
      console.error(err);
      return res.status(500).send('Lỗi khi bắt đầu giao dịch');
    }

    // Check for conflicts
    db.query(checkConflictQuery, [
      ngayBD.format('YYYY-MM-DD'), ngayBD.format('YYYY-MM-DD'),
      ngayKT.format('YYYY-MM-DD'), ngayKT.format('YYYY-MM-DD'),
      ngayBD.format('YYYY-MM-DD'), ngayKT.format('YYYY-MM-DD')
    ], (err, results) => {
      if (err) {
        return db.rollback(() => {
          console.error(err);
          res.status(500).send('Lỗi khi kiểm tra xung đột lịch làm');
        });
      }

      if (results.length > 0) {
        return db.rollback(() => {
          res.status(400).send('Khoảng thời gian mới bị xung đột với lịch làm việc hiện tại');
        });
      }

      // No conflicts, insert new schedule
      db.query(createScheduleQuery, [
        ngayBD.format('YYYY-MM-DD'),
        ngayKT.format('YYYY-MM-DD')
      ], (err, result) => {
        if (err) {
          return db.rollback(() => {
            console.error(err);
            res.status(500).send('Lỗi khi tạo lịch làm mới');
          });
        }

        // Commit transaction
        db.commit(err => {
          if (err) {
            return db.rollback(() => {
              console.error(err);
              res.status(500).send('Lỗi khi hoàn tất giao dịch');
            });
          }

          res.redirect('/quanly/sapxepvieclam');
        });
      });
    });
  });
});



// Định tuyến GET cho trang Quản lý nhân viên
app.get('/quanly/quanlynhanvien', (req, res) => {
  // Truy vấn cơ sở dữ liệu để lấy danh sách nhân viên
  const query = 'SELECT * FROM NHANVIEN';
  db.query(query, (err, results) => {
    if (err) throw err;
    const nhanviens = results;
    res.render('quanly/quanlynhanvien', { nhanviens });
  });
});
// Định nghĩa route để xử lý POST "Sửa" của thẻ a
app.post('/quanly/nhanvien/sua/:id', (req, res) => {
  const id = req.params.id;
  const taikhoan = req.body.taikhoan;
  const matkhau = req.body.matkhau;
  const sodienthoai = req.body.sodienthoai;
  const gmail = req.body.gmail;
  const gioitinh = req.body.gioitinh;
  const namsinh = req.body.namsinh;
  const hoten = req.body.hoten;
  const quequan = req.body.quequan;
  const id_cv = req.body.id_cv;
  // Cập nhật dữ liệu trong cơ sở dữ liệu
  const query = 'UPDATE NHANVIEN SET TAIKHOAN_NV = ?, MATKHAU_NV = ?, SODIENTHOAI_NV = ?, GMAIL_NV = ?, GIOITINH_NV = ?, NAMSINH_NV = ?, HOTEN_NV = ?, QUEQUAN_NV = ?, ID_CV = ? WHERE ID_NV = ?';
  db.query(query, [taikhoan, matkhau, sodienthoai, gmail, gioitinh, namsinh, hoten, quequan, id_cv, id], (err, result) => {
    if (err) {
      console.error('Lỗi cập nhật dữ liệu: ' + err.stack);
      return;
    }
    console.log('Đã cập nhật thành công dữ liệu');
    res.redirect('/quanly/quanlynhanvien'); // Chuyển hướng sau khi cập nhật thành công
  });
});
// Xử lý yêu cầu thêm nhân viên
// Route để thêm nhân viên mới
app.post('/quanly/nhanvien/them', async (req, res) => {
  const { taikhoan, matkhau, sodienthoai, gmail, gioitinh, hoten, quequan, id_cv } = req.body;

  try {
    // Kiểm tra xem tài khoản nhân viên đã tồn tại chưa
    const checkQuery = `SELECT COUNT(*) AS count FROM NHANVIEN WHERE TAIKHOAN_NV = ?`;
    db.query(checkQuery, [taikhoan], async (err, result) => {
      if (err) {
        console.error('Lỗi khi kiểm tra tài khoản nhân viên:', err);
        return res.status(500).send('Đã xảy ra lỗi khi kiểm tra tài khoản.');
      }

      if (result[0].count > 0) {
        // Tài khoản đã tồn tại, gửi thông báo lỗi
        return res.status(400).send('Tài khoản nhân viên đã tồn tại. Vui lòng chọn tên tài khoản khác.');
      }

      // Nếu tài khoản không tồn tại, tiến hành mã hóa mật khẩu và thêm nhân viên mới
      const hashedPassword = await bcrypt.hash(matkhau, 10);
      const insertQuery = `INSERT INTO NHANVIEN (TAIKHOAN_NV, MATKHAU_NV, SODIENTHOAI_NV, GMAIL_NV, GIOITINH_NV, HOTEN_NV, QUEQUAN_NV, ID_CV) 
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      const values = [taikhoan, hashedPassword, sodienthoai, gmail, gioitinh, hoten, quequan, id_cv];

      db.query(insertQuery, values, (err, results) => {
        if (err) {
          console.error('Lỗi khi thêm nhân viên:', err);
          return res.status(500).send('Đã xảy ra lỗi khi thêm nhân viên.');
        }

        // Chuyển hướng về trang quản lý nhân viên sau khi thêm thành công
        res.redirect('/quanly/quanlynhanvien');
      });
    });
  } catch (err) {
    console.error('Lỗi trong quá trình mã hóa mật khẩu hoặc thêm nhân viên:', err);
    res.status(500).send('Đã xảy ra lỗi khi thêm nhân viên.');
  }
});

// Xử lý yêu cầu xóa nhân viên
app.get('/quanly/nhanvien/xoa/:id', (req, res) => {
  const id = req.params.id;
  // Thực hiện truy vấn DELETE vào cơ sở dữ liệu để xóa nhân viên với ID tương ứng
  const query = 'DELETE FROM NHANVIEN WHERE ID_NV = ?';
  db.query(query, id, (err, results) => {
    if (err) throw err;
    res.redirect('/quanly/quanlynhanvien'); // Chuyển hướng về trang quản lý nhân viên sau khi xóa thành công
  });
});
// Xử lý yêu cầu tìm kiếm nhân viên
app.get('/quanly/nhanvien/timkiem', (req, res) => {
  const tukhoa = req.query.tukhoa;
  // Thực hiện truy vấn SELECT vào cơ sở dữ liệu để tìm kiếm nhân viên dựa trên từ khóa
  const query = 'SELECT * FROM NHANVIEN WHERE HOTEN_NV LIKE ?';
  const values = `%${tukhoa}%`;
  db.query(query, values, (err, results) => {
    if (err) throw err;
    const nhanviens = results;
    res.render('quanly/quanlynhanvien', { nhanviens });
  });
});
// Route GET /quanly/quanlynguyenlieu - Hiển thị danh sách nguyên liệu
app.get('/quanly/quanlynguyenlieu', (req, res) => {
  const query = 'SELECT * FROM nguyenlieu';
  db.query(query, (err, results) => {
    if (err) throw err;
    const nguyenlieu = results;
    res.render('quanly/quanlynguyenlieu', { nguyenlieu });
  });
});
app.get('/quanly/quanlynguyenlieu/timkiem', (req, res) => {
  const tukhoa = req.query.tukhoa;
  const query = 'SELECT * FROM nguyenlieu WHERE TEN_NL LIKE ?';
  db.query(query, [`%${tukhoa}%`], (err, results) => {
    if (err) throw err;
    const nguyenlieu = results;
    res.render('quanly/quanlynguyenlieu', { nguyenlieu });
  });
});
app.post('/quanly/quanlynguyenlieu/them', upload.single('anh_knl'), (req, res) => {
  const { ten_knl, dung_tich_knl } = req.body;
  const anh_knl = req.file ? `/uploads/${req.file.filename}` : null;
  const query = 'INSERT INTO nguyenlieu (TEN_NL, DUNG_TICH_NL, ANH_NL) VALUES (?, ?, ?)';
  db.query(query, [ten_knl, dung_tich_knl, anh_knl], (err, results) => {
    if (err) throw err;
    res.redirect('/quanly/quanlynguyenlieu');
  });
});
app.post('/quanly/quanlynguyenlieu/sua/:id', upload.single('anh_knl'), (req, res) => {
  const { id } = req.params;
  const { ten_knl, dung_tich_knl } = req.body;
  const anh_knl = req.file ? `/uploads/${req.file.filename}` : null;
  const query = anh_knl
    ? 'UPDATE nguyenlieu SET TEN_NL = ?, DUNG_TICH_NL = ?, ANH_NL = ? WHERE ID_NL = ?'
    : 'UPDATE nguyenlieu SET TEN_NL = ?, DUNG_TICH_NL = ? WHERE ID_NL = ?';
  const queryParams = anh_knl
    ? [ten_knl, dung_tich_knl, anh_knl, id]
    : [ten_knl, dung_tich_knl, id];
  db.query(query, queryParams, (err, results) => {
    if (err) throw err;
    res.redirect('/quanly/quanlynguyenlieu');
  });
});
app.get('/quanly/quanlynguyenlieu/xoa/:id', (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM nguyenlieu WHERE ID_NL = ?';
  db.query(query, [id], (err, results) => {
    if (err) throw err;
    res.redirect('/quanly/quanlynguyenlieu');
  });
});
// Route POST /quanly/quanlynguyenlieu/timkiem - Tìm kiếm nguyên liệu
app.get('/quanly/quanlynguyenlieu/timkiem', (req, res) => {
  const tukhoa = req.query.tukhoa;
  const query = 'SELECT * FROM NGUYENLIEU WHERE TEN_KNL LIKE ?';
  const values = `%${tukhoa}%`;
  db.query(query, values, (err, results) => {
    if (err) throw err;
    const nguyenlieu = results;
    res.redirect('quanly/quanlynguyenlieu', { nguyenlieu });
  });
});




app.get('/quanly/quanlycongthuc', (req, res) => {
  const sapxep = req.query.sapxep || ''; // Lấy tham số sắp xếp từ URL
  let orderClause = '';

  if (sapxep === 'ten') {
    orderClause = 'ORDER BY s.TEN_SP';
  }

  // Truy vấn dữ liệu từ bảng congthuc với thông tin từ các bảng liên quan
  const queryCongthuc = `
    SELECT c.ID_SP, s.TEN_SP, c.ID_NL, n.TEN_NL, c.ID_KICH_THUOC, k.TEN_KICH_THUOC, c.DUNG_TICH_NL_CAN
    FROM congthuc c
    JOIN sanpham s ON c.ID_SP = s.ID_SP
    JOIN nguyenlieu n ON c.ID_NL = n.ID_NL
    JOIN kichthuoc k ON c.ID_KICH_THUOC = k.ID_KICH_THUOC
    ${orderClause}
  `;

  // Truy vấn dữ liệu từ bảng congthuc
  db.query(queryCongthuc, (err, congthucResults) => {
    if (err) throw err;

    // Truy vấn dữ liệu từ bảng sanpham, nguyenlieu và kichthuoc để dùng cho form
    const querySanpham = 'SELECT * FROM sanpham';
    const queryNguyenlieu = 'SELECT * FROM nguyenlieu';
    const queryKichthuoc = 'SELECT * FROM kichthuoc';

    db.query(querySanpham, (err, sanphamResults) => {
      if (err) throw err;

      db.query(queryNguyenlieu, (err, nguyenlieuResults) => {
        if (err) throw err;

        db.query(queryKichthuoc, (err, kichthuocResults) => {
          if (err) throw err;

          // Render view EJS với tất cả dữ liệu cần thiết
          res.render('quanly/quanlycongthuc', {
            congthuc: congthucResults,
            sanpham: sanphamResults,
            nguyenlieu: nguyenlieuResults,
            kichthuoc: kichthuocResults
          });
        });
      });
    });
  });
});


// Route để tìm kiếm công thức
app.get('/quanly/quanlycongthuc/timkiem', (req, res) => {
  const tukhoa = req.query.tukhoa;
  const query = `
    SELECT congthuc.ID_SP, congthuc.ID_NL, congthuc.ID_KICH_THUOC, congthuc.DUNG_TICH_NL_CAN,
           sanpham.TEN_SP, nguyenlieu.TEN_NL, kichthuoc.TEN_KICH_THUOC
    FROM congthuc
    JOIN sanpham ON congthuc.ID_SP = sanpham.ID_SP
    JOIN nguyenlieu ON congthuc.ID_NL = nguyenlieu.ID_NL
    JOIN kichthuoc ON congthuc.ID_KICH_THUOC = kichthuoc.ID_KICH_THUOC
    WHERE sanpham.TEN_SP LIKE ?
  `;
  db.query(query, [`%${tukhoa}%`], (err, results) => {
    if (err) {
      console.error('Lỗi khi tìm kiếm công thức:', err);
      return res.status(500).send('Đã xảy ra lỗi khi tìm kiếm công thức.');
    }
    const congthuc = results;

    // Truy vấn dữ liệu từ bảng sanpham, nguyenlieu và kichthuoc để dùng cho form
    const querySanpham = 'SELECT * FROM sanpham';
    const queryNguyenlieu = 'SELECT * FROM nguyenlieu';
    const queryKichthuoc = 'SELECT * FROM kichthuoc';

    db.query(querySanpham, (err, sanphamResults) => {
      if (err) throw err;

      db.query(queryNguyenlieu, (err, nguyenlieuResults) => {
        if (err) throw err;

        db.query(queryKichthuoc, (err, kichthuocResults) => {
          if (err) throw err;

          // Render view EJS với tất cả dữ liệu cần thiết
          res.render('quanly/quanlycongthuc', {
            congthuc: congthuc,
            sanpham: sanphamResults,
            nguyenlieu: nguyenlieuResults,
            kichthuoc: kichthuocResults
          });
        });
      });
    });
  });
});


// Route để thêm công thức
app.post('/quanly/quanlycongthuc/them', (req, res) => {
  const { id_sp, id_nl, id_kich_thuoc, dung_tich_nl_can } = req.body;

  const checkQuery = `SELECT * FROM congthuc WHERE ID_SP = ? AND ID_NL = ? AND ID_KICH_THUOC = ?`;
  db.query(checkQuery, [id_sp, id_nl, id_kich_thuoc], (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send('Lỗi truy vấn cơ sở dữ liệu');
      return;
    }

    if (results.length > 0) {
      // Tr�� về phản hồi chứa thông báo lỗi
      res.send(`<script>alert('Tổ hợp Sản phẩm - Nguyên liệu - Kích thước đã tồn tại!'); window.location.href='/quanly/quanlycongthuc';</script>`);
    } else {
      const insertQuery = `INSERT INTO congthuc (ID_SP, ID_NL, ID_KICH_THUOC, DUNG_TICH_NL_CAN) VALUES (?, ?, ?, ?)`;
      db.query(insertQuery, [id_sp, id_nl, id_kich_thuoc, dung_tich_nl_can], (err, results) => {
        if (err) {
          console.error(err);
          res.status(500).send('Lỗi khi thêm dữ liệu vào cơ sở dữ liệu');
          return;
        }
        // Trả về phản hồi thành công
        res.send(`<script>alert('Thêm công thức thành công!'); window.location.href='/quanly/quanlycongthuc';</script>`);
      });
    }
  });
});


// Route để xử lý việc sửa công thức
app.post('/quanly/quanlycongthuc/sua/:id_sp/:id_nl/:id_kich_thuoc', (req, res) => {
  const { id_sp, id_nl, id_kich_thuoc } = req.params;
  const { dung_tich_nl_can } = req.body;

  const queryUpdate = `
    UPDATE congthuc
    SET DUNG_TICH_NL_CAN = ?
    WHERE ID_SP = ? AND ID_NL = ? AND ID_KICH_THUOC = ?
  `;

  db.query(queryUpdate, [dung_tich_nl_can, id_sp, id_nl, id_kich_thuoc], (err, result) => {
    if (err) throw err;
    res.redirect('/quanly/quanlycongthuc');
  });
});
// Route để xử lý việc xóa công thức
app.get('/quanly/quanlycongthuc/xoa/:id_sp/:id_nl/:id_kich_thuoc', (req, res) => {
  const { id_sp, id_nl, id_kich_thuoc } = req.params;

  const queryDelete = `
    DELETE FROM congthuc
    WHERE ID_SP = ? AND ID_NL = ? AND ID_KICH_THUOC = ?
  `;

  db.query(queryDelete, [id_sp, id_nl, id_kich_thuoc], (err, result) => {
    if (err) throw err;
    res.redirect('/quanly/quanlycongthuc');
  });
});
// Route để hiển thị trang quản lý danh mục
app.get('/quanly/quanlydanhmuc', (req, res) => {
  const query = 'SELECT * FROM DANHMUC';
  db.query(query, (err, results) => {
    if (err) throw err;
    res.render('quanly/quanlydanhmuc', { danhmuc: results });
  });
});
// Route để thêm danh mục mới
app.post('/quanly/quanlydanhmuc/them', (req, res) => {
  const { ten_dm } = req.body;
  const query = 'INSERT INTO DANHMUC (TEN_DM) VALUES (?)';
  db.query(query, [ten_dm], (err, result) => {
    if (err) throw err;
    res.redirect('/quanly/quanlydanhmuc');
  });
});
// Route để sửa danh mục
app.post('/quanly/quanlydanhmuc/sua/:id', (req, res) => {
  const id_dm = req.params.id;
  const { ten_dm } = req.body;
  const query = 'UPDATE DANHMUC SET TEN_DM = ? WHERE ID_DM = ?';
  db.query(query, [ten_dm, id_dm], (err, result) => {
    if (err) throw err;
    res.redirect('/quanly/quanlydanhmuc');
  });
});
// Route để xóa danh mục  
app.get('/quanly/quanlydanhmuc/xoa/:id', (req, res) => {
  const id_dm = req.params.id;
  const query = 'DELETE FROM DANHMUC WHERE ID_DM = ?';
  db.query(query, [id_dm], (err, result) => {
    if (err) throw err;
    res.redirect('/quanly/quanlydanhmuc');
  });
});
// Xem danh sách sản phẩm
// Giả sử đây là route handler cho đường dẫn /quanly/quanlysanpham
app.get('/quanly/quanlysanpham', (req, res) => {
  db.query('SELECT * FROM danhmuc', (err, danhmuc) => {
    if (err) {
      console.error('Lỗi khi truy vấn danh mục:', err);
      return res.status(500).send('Lỗi khi truy vấn danh mục');
    }

    console.log('Danh mục:', danhmuc);

    db.query('SELECT * FROM sanpham', (err, sanpham) => {
      if (err) {
        console.error('Lỗi khi truy vấn sản phẩm:', err);
        return res.status(500).send('Lỗi khi truy vấn sản phẩm');
      }

      console.log('Sản phẩm:', sanpham);

      res.render('quanly/quanlysanpham', { danhmuc, sanpham });
    });
  });
});
// Route thêm sản phẩm mới
app.post('/quanly/quanlysanpham/them', upload.single('anh_sp'), (req, res) => {
  const { ten_sp, trangthai_sp, gia_sp, id_dm } = req.body;
  const anh_sp = req.file ? req.file.filename : null;

  const insertProductQuery = 'INSERT INTO sanpham (TEN_SP, TRANGTHAI_SP, GIA_SP, ANH_SP, ID_DM) VALUES (?, ?, ?, ?, ?)';
  db.query(insertProductQuery, [ten_sp, trangthai_sp, gia_sp, anh_sp, id_dm], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).send('Lỗi khi thêm sản phẩm');
    } else {
      res.redirect('/quanly/quanlysanpham');
    }
  });
});
// Route sửa sản phẩm
app.post('/quanly/quanlysanpham/sua/:id', upload.single('anh_sp'), (req, res) => {
  const { ten_sp, trangthai_sp, gia_sp, id_dm } = req.body;
  const anh_sp = req.file ? req.file.filename : null;

  let updateProductQuery = 'UPDATE sanpham SET TEN_SP = ?, TRANGTHAI_SP = ?, GIA_SP = ?, ID_DM = ?';
  const queryParams = [ten_sp, trangthai_sp, gia_sp, id_dm];

  if (anh_sp) {
    updateProductQuery += ', ANH_SP = ?';
    queryParams.push(anh_sp);
  }

  updateProductQuery += ' WHERE ID_SP = ?';
  queryParams.push(req.params.id);

  db.query(updateProductQuery, queryParams, (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).send('Lỗi khi sửa sản phẩm');
    } else {
      res.redirect('/quanly/quanlysanpham');
    }
  });
});
// Route xóa sản phẩm
app.get('/quanly/quanlysanpham/xoa/:id', (req, res) => {
  const id = req.params.id;
  const query = 'DELETE FROM sanpham WHERE ID_SP = ?';
  db.query(query, [id], (err, results) => {
    if (err) throw err;
    res.redirect('/quanly/quanlysanpham');
  });
});
app.post('/quanly/quanlysanpham/timkiem', (req, res) => {
  const keyword = req.body.keyword;
  const querySanpham = 'SELECT * FROM sanpham WHERE TEN_SP LIKE ?';
  const queryDanhmuc = 'SELECT * FROM danhmuc';

  db.query(querySanpham, [`%${keyword}%`], (err, sanphamResults) => {
    if (err) {
      console.log(err);
      return res.sendStatus(500);
    }

    db.query(queryDanhmuc, (err, danhmucResults) => {
      if (err) {
        console.log(err);
        return res.sendStatus(500);
      }

      // Truyền cả sanpham và danhmuc vào view
      res.render('quanly/quanlysanpham', { sanpham: sanphamResults, danhmuc: danhmucResults });
    });
  });
});
// Xử lý GET request để hiển thị thông tin lương
app.get('/quanly/quanlyluong', (req, res) => {
  // Lấy tháng từ query parameter
  let selectedMonth = req.query.thang;
  
  // Nếu không có tháng được chọn, lấy tháng và năm hiện tại
  if (!selectedMonth) {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonthNumber = currentDate.getMonth() + 1; // Get month (0-based index)
    selectedMonth = `${currentYear}-${currentMonthNumber.toString().padStart(2, '0')}`;
  }

  // Tách năm và tháng từ selectedMonth
  const [selectedYear, selectedMonthNumber] = selectedMonth.split('-');

  // Truy vấn dữ liệu từ cơ sở dữ liệu cho bảng luong và nhanvien
  const queryLuong = `
    SELECT 
        luong.ID_L,
        luong.NGAYTINH_L,
        luong.TONG_L,
        nhanvien.HOTEN_NV
    FROM 
        luong
    JOIN 
        nhanvien ON luong.ID_NV = nhanvien.ID_NV
    WHERE 
        DATE_FORMAT(luong.NGAYTINH_L, '%Y-%m') = ?;
  `;

  const valuesLuong = [`${selectedYear}-${selectedMonthNumber}`];

  db.query(queryLuong, valuesLuong, (err, luongResults) => {
    if (err) {
      console.error('Lỗi khi thực hiện câu truy vấn SQL:', err);
      return res.status(500).send('Lỗi hệ thống');
    }

    // Truy vấn dữ liệu từ cơ sở dữ liệu cho bảng chamcong và các bảng liên quan
    const queryChamCong = `
    SELECT 
        CC.ID_CC, 
        CC.THOIGIANVAOCA, 
        CC.THOIGIANKETCA, 
        LL.NGAY_L AS NGAY_CC, -- Lấy NGAY_CC từ lichlam.NGAY_L
        CC.ID_NV, 
        NV.HOTEN_NV, 
        CV.TEN_CV
    FROM 
        CHAMCONG CC
    INNER JOIN 
        NHANVIEN NV ON CC.ID_NV = NV.ID_NV
    INNER JOIN 
        CHUCVU CV ON NV.ID_CV = CV.ID_CV
    INNER JOIN 
        LICHLAM LL ON LL.ID_LL = CC.ID_LL -- Kết nối LICHLAM qua ID_LL
    WHERE 
        DATE_FORMAT(LL.NGAY_L, '%Y-%m') = ?; -- Lọc theo tháng và năm từ NGAY_L
    `;
    
    const valuesChamCong = [`${selectedYear}-${selectedMonthNumber}`];

    db.query(queryChamCong, valuesChamCong, (err, chamCongResults) => {
      if (err) {
        console.error('Lỗi khi thực hiện câu truy vấn SQL:', err);
        return res.status(500).send('Lỗi hệ thống');
      }

      // Xử lý logic tính lương từ kết quả của bảng chamcong
      const luongs = chamCongResults.map(row => {
        const thoiGianVaoCa = row.THOIGIANVAOCA;
        const thoiGianKetCa = row.THOIGIANKETCA;
        const thoiGianLamViec = calculateWorkingTime(thoiGianVaoCa, thoiGianKetCa);
        const mucLuong = getSalaryByChucVu(row.TEN_CV);
        const tongLuong = thoiGianLamViec * mucLuong;
        return {
          id_cc: row.ID_CC,
          id_nv: row.ID_NV,
          ngay_cc: row.NGAY_CC,
          HOTEN_NV: row.HOTEN_NV,
          ten_cv: row.TEN_CV,
          thoi_gian_vao_ca: thoiGianVaoCa,
          thoi_gian_ket_ca: thoiGianKetCa,
          thoi_gian_lam_viec: thoiGianLamViec,
          muc_luong: mucLuong,
          tong_luong: tongLuong
        };
      });

      // Tính toán tổng lương theo nhân viên
      const luongByNhanVien = {};
      luongs.forEach(luong => {
        if (!luongByNhanVien[luong.id_nv]) {
          luongByNhanVien[luong.id_nv] = {
            id_nv: luong.id_nv,
            ten_nv: luong.HOTEN_NV,
            ten_cv: luong.ten_cv,
            muc_luong: luong.muc_luong,
            tong_ngay_lam: 0,
            tong_gio_lam: 0,
            tong_luong: 0
          };
        }
        luongByNhanVien[luong.id_nv].tong_ngay_lam += 1;
        luongByNhanVien[luong.id_nv].tong_gio_lam += luong.thoi_gian_lam_viec;
        luongByNhanVien[luong.id_nv].tong_luong += luong.tong_luong;
      });

      // Render trang EJS và truyền dữ liệu lương từ cả hai bảng
      res.render('quanly/quanlyluong', {
        luongs,
        luongByNhanVien,
        luongResults, // Dữ liệu từ bảng luong
        currentMonth: selectedMonth
      });
    });
  });
});
// Hàm kiểm tra xem lương đã được xác nhận chưa
function isLuongConfirmed(ngayTinh, id_nv, callback) {
  const query = `
    SELECT * FROM LUONG WHERE NGAYTINH_L = ? AND ID_NV = ?
  `;
  const values = [ngayTinh, id_nv];
  db.query(query, values, (err, results) => {
    if (err) {
      console.error('Lỗi khi thực hiện câu truy vấn SQL:', err);
      return callback(err);
    }
    callback(null, results.length > 0);
  });
}
// Xử lý POST request để xác nhận lương
app.post('/luong/xacnhan', (req, res) => {
  const { ngay_tinh, tong_luong, id_nv } = req.body;

  // Kiểm tra xem lương đã được xác nhận cho nhân viên và ngày tính này chưa
  const checkQuery = `
    SELECT COUNT(*) AS count
    FROM LUONG
    WHERE ID_NV = ? AND NGAYTINH_L = ?
  `;
  const checkValues = [id_nv, ngay_tinh];

  db.query(checkQuery, checkValues, (err, results) => {
    if (err) {
      console.error('Lỗi khi thực hiện câu truy vấn kiểm tra:', err);
      return res.status(500).send('Lỗi hệ thống');
    }

    const count = results[0].count;

    if (count > 0) {
      // Nếu đã tồn tại, thông báo lỗi hoặc thực hiện hành động khác
      return res.status(400).send('Lương đã được xác nhận cho nhân viên này trong tháng này.');
    }

    // Nếu chưa tồn tại, chèn dữ liệu lương mới
    const insertQuery = `
      INSERT INTO LUONG (NGAYTINH_L, TONG_L, ID_NV)
      VALUES (?, ?, ?)
    `;
    const insertValues = [ngay_tinh, tong_luong, id_nv];

    db.query(insertQuery, insertValues, (err, results) => {
      if (err) {
        console.error('Lỗi khi thực hiện câu truy vấn chèn dữ liệu:', err);
        return res.status(500).send('Lỗi hệ thống');
      }

      // Xử lý thành công
      res.redirect('/quanly/quanlyluong'); // Chuyển hướng đến trang thành công
    });
  });
});


// Hàm tính thời gian làm việc từ thời gian vào ca và thời gian kết ca
function calculateWorkingTime(thoiGianVaoCa, thoiGianKetCa) {
  const t1 = new Date(`1970-01-01T${thoiGianVaoCa}`);
  const t2 = new Date(`1970-01-01T${thoiGianKetCa}`);
  const diff = t2 - t1;
  return diff / 1000 / 60 / 60; // Trả về số giờ làm việc
}

// Hàm lấy mức lương dựa trên chức vụ
function getSalaryByChucVu(chucVu) {
  if (chucVu === 'Nhân viên') {
    return 15000; // Mức lương của Nhân viên: 15000/giờ
  } else if (chucVu === 'Quản lý') {
    return 20000; // Mức lương của Quản lý: 20000/giờ
  }
  return 0; // Trường hợp chức vụ không khớp, trả về 0 hoặc giá trị mặc định khác
}

// Định tuyến GET cho trang Thống kê doanh thu
app.get('/quanly/thongkenhanvien', (req, res) => {
  const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();

  const query1 = `
    SELECT 
      nv.ID_NV,
      nv.HOTEN_NV,
      COUNT(DISTINCT ll.NGAY_L) AS TONG_SO_NGAY_LAM, 
      COUNT(cc.ID_CC) AS TONG_SO_LAN_CHAM_CONG, 
      COUNT(cc.THOIGIAN_DI_TRE) AS TONG_SO_LAN_DI_TRE 
    FROM 
      nhanvien nv
    JOIN 
      chamcong cc ON nv.ID_NV = cc.ID_NV
    JOIN 
      lichlam ll ON ll.ID_LL = cc.ID_LL 
      AND (ll.CA_1 = nv.ID_NV OR ll.CA_2 = nv.ID_NV OR ll.CA_3 = nv.ID_NV)
    WHERE 
      MONTH(ll.NGAY_L) = ? AND YEAR(ll.NGAY_L) = ? 
    GROUP BY 
      nv.ID_NV, nv.HOTEN_NV
    ORDER BY 
      nv.ID_NV;
  `;

  const query2 = `
    SELECT 
      nv.ID_NV,
      nv.HOTEN_NV,
      COUNT(CASE WHEN hd.TRANGTHAI = 'Đã xác nhận' THEN 1 END) AS TONG_SO_HOA_DON_DA_XAC_NHAN,
      COUNT(CASE WHEN hd.TRANGTHAI = 'Đã hủy' THEN 1 END) AS TONG_SO_HOA_DON_DA_HUY,
      SUM(CASE WHEN hd.TRANGTHAI = 'Đã xác nhận' THEN cthd.SOLUONG ELSE 0 END) AS TONG_SOLUONG_SANPHAM_DA_BAN
    FROM 
      nhanvien nv
    LEFT JOIN 
      hoadon hd ON nv.ID_NV = hd.ID_NV
    LEFT JOIN 
      chitiethoadon cthd ON hd.ID_HD = cthd.ID_HD
    WHERE 
      MONTH(hd.NGAYLAP_HD) = ? AND YEAR(hd.NGAYLAP_HD) = ?
    GROUP BY 
      nv.ID_NV, nv.HOTEN_NV
    ORDER BY 
      nv.ID_NV;
  `;

  const query3 = `
    SELECT 
      luong.ID_L,
      luong.NGAYTINH_L,
      luong.TONG_L,
      nhanvien.HOTEN_NV
    FROM 
      luong
    JOIN 
      nhanvien ON luong.ID_NV = nhanvien.ID_NV
    WHERE 
      MONTH(luong.NGAYTINH_L) = ? AND YEAR(luong.NGAYTINH_L) = ?;
  `;

  db.query(query1, [month, year], (err, results1) => {
    if (err) {
      console.error('Lỗi khi lấy dữ liệu từ query1:', err);
      return res.status(500).send('Đã xảy ra lỗi khi lấy dữ liệu.');
    }

    db.query(query2, [month, year], (err, results2) => {
      if (err) {
        console.error('Lỗi khi lấy dữ liệu từ query2:', err);
        return res.status(500).send('Đã xảy ra lỗi khi lấy dữ liệu.');
      }

      db.query(query3, [month, year], (err, results3) => {
        if (err) {
          console.error('Lỗi khi lấy dữ liệu từ query3:', err);
          return res.status(500).send('Đã xảy ra lỗi khi lấy dữ liệu.');
        }

        // Tổng hợp dữ liệu
        const totalEmployees = results1.length;
        const totalWorkingDays = results1.reduce((acc, cur) => acc + cur.TONG_SO_NGAY_LAM, 0);
        const totalConfirmedInvoices = results2.reduce((acc, cur) => acc + cur.TONG_SO_HOA_DON_DA_XAC_NHAN, 0);
        const totalSoldProducts = results2.reduce((acc, cur) => acc + cur.TONG_SOLUONG_SANPHAM_DA_BAN, 0);
        const totalSalaries = results3.reduce((acc, cur) => acc + cur.TONG_L, 0);

        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        // Render template với dữ liệu tổng hợp
        res.render('quanly/thongkenhanvien', {
          results1,
          results2,
          results3,
          currentMonth,
          currentYear,
          totalEmployees,
          totalWorkingDays,
          totalConfirmedInvoices,
          totalSoldProducts,
          totalSalaries
        });
      });
    });
  });
});

app.get('/quanly/thongkedoanhthu', (req, res) => {
  const selectedMonth = req.query.month;
  const selectedYear = req.query.year;
  const currentYear = new Date().getFullYear(); // Lấy năm hiện tại
  // Kiểm tra nếu không có tháng hoặc năm được chọn
  if (!selectedMonth || !selectedYear) {
    return res.render('quanly/thongkedoanhthu', {
      currentYear, // Truyền currentYear vào template
      selectedMonth,
      selectedYear,
      doanhThu: null,
      productStats: {
        mostSold: null,
        leastSold: null
      }
    });
  }
  const revenueQuery = `
SELECT 
  SUM(cthd.GIA_SP_HT * cthd.SOLUONG) AS TongDoanhThu,
  SUM(CASE WHEN hd.LOAI_TT = 'Đặt trước' THEN cthd.GIA_SP_HT * cthd.SOLUONG ELSE 0 END) AS DoanhThuDatTruoc,
  SUM(CASE WHEN hd.LOAI_TT = 'Trực tiếp' THEN cthd.GIA_SP_HT * cthd.SOLUONG ELSE 0 END) AS DoanhThuTrucTiep,
  SUM(CASE WHEN hd.LOAI_TT = 'Chuyển khoản' THEN cthd.GIA_SP_HT * cthd.SOLUONG ELSE 0 END) AS DoanhThuChuyenKhoan,
  SUM(cthd.SOLUONG) AS TongSoLuongLyBanDuoc
FROM 
  hoadon hd
JOIN 
  chitiethoadon cthd ON hd.ID_HD = cthd.ID_HD
WHERE 
  hd.TRANGTHAI = 'Đã xác nhận' 
  AND MONTH(hd.NGAYLAP_HD) = ? 
  AND YEAR(hd.NGAYLAP_HD) = ?;

  `;
  const mostSoldProductQuery = `
    SELECT 
      sp.ID_SP,
      sp.TEN_SP,
      SUM(cthd.SOLUONG) AS TONG_SO_LUONG_BAN
    FROM 
      sanpham sp
    JOIN 
      chitiethoadon cthd ON sp.ID_SP = cthd.ID_SP
    JOIN 
      hoadon hd ON cthd.ID_HD = hd.ID_HD
    WHERE 
      hd.TRANGTHAI = 'Đã xác nhận'  
      AND MONTH(hd.NGAYLAP_HD) = ? 
      AND YEAR(hd.NGAYLAP_HD) = ?
    GROUP BY 
      sp.ID_SP, sp.TEN_SP
    ORDER BY 
      TONG_SO_LUONG_BAN DESC
    LIMIT 1;
  `;

  const leastSoldProductQuery = `
    SELECT 
      sp.ID_SP,
      sp.TEN_SP,
      SUM(cthd.SOLUONG) AS TONG_SO_LUONG_BAN
    FROM 
      sanpham sp
    JOIN 
      chitiethoadon cthd ON sp.ID_SP = cthd.ID_SP
    JOIN 
      hoadon hd ON cthd.ID_HD = hd.ID_HD
    WHERE 
      hd.TRANGTHAI = 'Đã xác nhận'  
      AND MONTH(hd.NGAYLAP_HD) = ? 
      AND YEAR(hd.NGAYLAP_HD) = ?
    GROUP BY 
      sp.ID_SP, sp.TEN_SP
    ORDER BY 
      TONG_SO_LUONG_BAN ASC
    LIMIT 1;
  `;

  // Sau khi hoàn tất truy vấn và xử lý dữ liệu
  db.query(revenueQuery, [selectedMonth, selectedYear], (err, revenueResults) => {
    if (err) {
      console.error('Error executing revenue query', err);
      return res.status(500).send('Internal Server Error');
    }

    const doanhThu = revenueResults[0];

    db.query(mostSoldProductQuery, [selectedMonth, selectedYear], (err, mostSoldResults) => {
      if (err) {
        console.error('Error executing most sold product query', err);
        return res.status(500).send('Internal Server Error');
      }

      const mostSold = mostSoldResults[0];

      db.query(leastSoldProductQuery, [selectedMonth, selectedYear], (err, leastSoldResults) => {
        if (err) {
          console.error('Error executing least sold product query', err);
          return res.status(500).send('Internal Server Error');
        }

        const leastSold = leastSoldResults[0];

        // Render view và truyền dữ liệu doanh thu và thống kê sản phẩm
        res.render('quanly/thongkedoanhthu', {
          currentYear, // Truyền currentYear vào template
          selectedMonth,
          selectedYear,
          doanhThu,
          productStats: {
            mostSold,
            leastSold
          }
        });
      });
    });
  });
});
app.get('/quanly/thongkesanpham', (req, res) => {
  const selectedMonth = parseInt(req.query.month) || new Date().getMonth() + 1;
  const selectedYear = parseInt(req.query.year) || new Date().getFullYear();

  // Truy vấn số lượng bán
  const salesQuery = `
SELECT 
    sp.ID_SP,
    sp.TEN_SP,
    COALESCE(SUM(cthd.SOLUONG), 0) AS TONG_SO_LUONG_BAN
FROM 
    sanpham sp
LEFT JOIN 
    chitiethoadon cthd ON sp.ID_SP = cthd.ID_SP
LEFT JOIN 
    hoadon hd ON cthd.ID_HD = hd.ID_HD 
WHERE 
    hd.TRANGTHAI = 'Đã xác nhận' 
    AND MONTH(hd.NGAYLAP_HD) = ? 
    AND YEAR(hd.NGAYLAP_HD) = ? 
GROUP BY 
    sp.ID_SP, sp.TEN_SP
ORDER BY 
    TONG_SO_LUONG_BAN DESC;
  `;

  // Truy vấn số lượng đánh giá
  const reviewsQuery = `
      SELECT 
          sp.ID_SP,
          sp.TEN_SP,
          COALESCE(COUNT(dg.ID_DG), 0) AS TONG_SO_LUONG_DANH_GIA
      FROM 
          sanpham sp
      LEFT JOIN 
          danhgia dg ON sp.ID_SP = dg.ID_SP
      WHERE 
          MONTH(dg.NGAY_DG) = ? 
          AND YEAR(dg.NGAY_DG) = ?
      GROUP BY 
          sp.ID_SP, sp.TEN_SP
      ORDER BY 
          TONG_SO_LUONG_DANH_GIA DESC;
  `;

  // Thực hiện truy vấn doanh thu
  db.query(salesQuery, [selectedMonth, selectedYear], (err, salesResults) => {
    if (err) {
      console.error('Error executing sales query', err);
      return res.status(500).send('Internal Server Error');
    }

    // Thực hiện truy vấn đánh giá
    db.query(reviewsQuery, [selectedMonth, selectedYear], (err, reviewsResults) => {
      if (err) {
        console.error('Error executing reviews query', err);
        return res.status(500).send('Internal Server Error');
      }

      // Render view và truyền dữ liệu doanh thu và thống kê sản phẩm
      res.render('quanly/thongkesanpham', {
        month: selectedMonth,
        year: selectedYear,
        sales: salesResults,
        reviews: reviewsResults
      });
    });
  });
});

// Định nghĩa route để lấy và hiển thị danh sách sản phẩm cho nhân viên
app.get('/nhanvien/datnuoc', (req, res) => {
  const idNhanVien = req.session.idNhanVien;
  const successMessage = req.session.successMessage; // Lấy thông báo từ session
  delete req.session.successMessage; // Xóa thông báo sau khi hiển thị

  const queryProducts = 'SELECT * FROM sanpham';
  const querySizes = 'SELECT * FROM kichthuoc';
  const queryCart = `
    SELECT gh.ID_GHNV, sp.TEN_SP, kt.TEN_KICH_THUOC, gh.SOLUONG, gh.GIA_UOCTINH, sp.ANH_SP, gh.ID_SP, gh.ID_KICH_THUOC
    FROM giohangnhanvien gh
    JOIN sanpham sp ON gh.ID_SP = sp.ID_SP
    JOIN kichthuoc kt ON gh.ID_KICH_THUOC = kt.ID_KICH_THUOC
    WHERE gh.ID_NV = ?
  `;
  const queryCategories = 'SELECT * FROM danhmuc';
  const queryIngredients = `
    SELECT ct.ID_SP, nl.TEN_NL, nl.DUNG_TICH_NL, ct.DUNG_TICH_NL_CAN
    FROM congthuc ct
    JOIN nguyenlieu nl ON ct.ID_NL = nl.ID_NL
  `;

  db.query(queryProducts, (err, products) => {
    if (err) throw err;
    db.query(querySizes, (err, sizes) => {
      if (err) throw err;
      db.query(queryCart, [idNhanVien], (err, cart) => {
        if (err) throw err;

        const groupedCart = cart.reduce((acc, item) => {
          const key = `${item.ID_SP}-${item.ID_KICH_THUOC}`;
          if (!acc[key]) {
            acc[key] = { ...item, SOLUONG: 0 };
          }
          acc[key].SOLUONG += item.SOLUONG;
          return acc;
        }, {});

        db.query(queryCategories, (err, categories) => {
          if (err) throw err;
          db.query(queryIngredients, (err, ingredients) => {
            if (err) throw err;

            const lyMap = products.reduce((acc, product) => {
              const productIngredients = ingredients.filter(ingredient => ingredient.ID_SP === product.ID_SP);
              const lyCounts = productIngredients.map(ingredient => Math.floor(ingredient.DUNG_TICH_NL / ingredient.DUNG_TICH_NL_CAN));
              const minLyCount = Math.min(...lyCounts);
              acc[product.ID_SP] = minLyCount;
              return acc;
            }, {});

            // Cập nhật trạng thái sản phẩm
            products.forEach(product => {
              if (lyMap[product.ID_SP] <= 1) {
                product.TRANGTHAI_SP = 'Hết';
              } else {
                product.TRANGTHAI_SP = 'Còn';
              }
            });

            // Render trang và truyền dữ liệu
            res.render('nhanvien/datnuoc', { 
              products, 
              sizes, 
              cart: Object.values(groupedCart), 
              categories, 
              lyMap, 
              successMessage // Truyền thông báo vào EJS
            });
          });
        });
      });
    });
  });
});

app.post('/nhanvien/addToCart', (req, res) => {
  const { soluong, kichthuoc, sp_id, gia_uoctinh } = req.body;
  const ID_NV = req.session.idNhanVien; // Lấy ID_NV từ session
  // Insert vào bảng giohangnhanvien
  const insertQuery = `INSERT INTO giohangnhanvien (SOLUONG, GIA_UOCTINH, ID_KICH_THUOC, ID_SP, ID_NV) VALUES (?, ?, ?, ?, ?)`;
  db.query(insertQuery, [soluong, gia_uoctinh, kichthuoc, sp_id, ID_NV], (err, result) => {
    if (err) {
      console.error("Error inserting into giohangnhanvien:", err);
      res.status(500).json({ message: "Internal server error" });
    } else {
      res.redirect('./datnuoc'); // Thay đổi đường dẫn redirect tùy vào yêu cầu của bạn
    }
  });
});
app.post('/nhanvien/xoa_giohang/:id', (req, res) => {
  const giohangnhanvienId = req.params.id; // Lấy ID của giỏ hàng từ đường dẫn URL
  // Thực hiện xóa từ CSDL
  const deleteQuery = `DELETE FROM giohangnhanvien WHERE ID_GHNV = ?`;
  db.query(deleteQuery, [giohangnhanvienId], (err, result) => {
    if (err) {
      console.error("Error deleting from giohangnhanvien:", err);
      res.status(500).json({ message: "Internal server error" });
    } else {
      res.redirect('../datnuoc'); // Thay đổi đường dẫn redirect tùy vào yêu cầu của bạn
    }
  });
});
app.post('/nhanvien/thanhtoan', (req, res) => {
  const idNhanVien = req.session.idNhanVien;

  // Kiểm tra toàn bộ req.body để đảm bảo dữ liệu được truyền đúng
  console.log('Ghi chú nhận được:', req.body);

  // Lấy tất cả các ghi chú từ req.body
  const ghiChuKeys = Object.keys(req.body).filter(key => key.startsWith('ghichu_'));
  const ghiChuMap = {};
  ghiChuKeys.forEach(key => {
    const idGioHang = key.split('_')[1];
    ghiChuMap[idGioHang] = req.body[key];
  });

  // Kiểm tra ghiChuMap sau khi tạo
  console.log('Ghi chú đã ánh xạ:', ghiChuMap);

  // Lấy thông tin giỏ hàng của nhân viên
  db.query('SELECT * FROM giohangnhanvien WHERE ID_NV = ?', [idNhanVien], (err, gioHangResults) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Lỗi khi lấy thông tin giỏ hàng.');
    }

    // Kiểm tra thông tin giỏ hàng đã lấy ra
    console.log('Thông tin giỏ hàng:', gioHangResults);

    // Tính tổng hóa đơn
    let tongHoaDon = 0;
    gioHangResults.forEach(item => {
      tongHoaDon += item.GIA_UOCTINH * item.SOLUONG;
    });

    const ngayLapHD = new Date();
    const idKhachHang = null; // Không có khách hàng (để null)
    const trangThai = 'Đã xác nhận';
    const loaiThanhToan = 'Trực tiếp'; // Bạn có thể thay đổi hoặc lấy từ form người dùng nếu cần
    const moTa = ''; // Mô tả thêm nếu cần

    // Tạo hóa đơn mới
    db.query(
      'INSERT INTO hoadon (NGAYLAP_HD, ID_NV, TONG_HD, TRANGTHAI, ID_KH, LOAI_TT, MOTA) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [ngayLapHD, idNhanVien, tongHoaDon, trangThai, idKhachHang, loaiThanhToan, moTa],
      (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).send('Lỗi khi tạo hóa đơn.');
        }

        const idHoaDon = result.insertId; // Lấy ID của hóa đơn vừa tạo
        console.log('Hóa đơn đã được tạo với ID:', idHoaDon);

        const chiTietHoaDonQueries = [];
        const nguyenLieuUpdates = [];

        gioHangResults.forEach(item => {
          // Lấy ghi chú từ ghiChuMap dựa trên ID_GH
          const ghiChu = ghiChuMap[item.ID_GHNV] || '';
          
          // Kiểm tra giá trị ghi chú và ID_GH
          console.log('Thêm chi tiết hóa đơn với:', [item.SOLUONG, idHoaDon, item.ID_SP, item.GIA_UOCTINH, item.ID_KICH_THUOC, ghiChu]);

          // Tạo chi tiết hóa đơn cho mỗi sản phẩm trong giỏ hàng
          chiTietHoaDonQueries.push(
            new Promise((resolve, reject) => {
              db.query(
                'INSERT INTO chitiethoadon (SOLUONG, ID_HD, ID_SP, GIA_SP_HT, ID_KICH_THUOC, GHICHU) VALUES (?, ?, ?, ?, ?, ?)',
                [item.SOLUONG, idHoaDon, item.ID_SP, item.GIA_UOCTINH, item.ID_KICH_THUOC, ghiChu],
                (err, result) => {
                  if (err) {
                    console.error('Lỗi khi chèn chi tiết hóa đơn:', err);
                    reject(err);
                  } else {
                    console.log('Thêm chi tiết hóa đơn thành công với ID_GH:', item.ID_GHNV, 'và ghi chú:', ghiChu);
                    resolve();
                  }
                }
              );
            })
          );

          // Cập nhật nguyên liệu sau khi sản phẩm được thêm vào hóa đơn
          const queryCongThuc = `
            SELECT ID_NL, DUNG_TICH_NL_CAN
            FROM congthuc
            WHERE ID_SP = ? AND ID_KICH_THUOC = ?
          `;

          chiTietHoaDonQueries.push(
            new Promise((resolve, reject) => {
              db.query(queryCongThuc, [item.ID_SP, item.ID_KICH_THUOC], (err, congthucResults) => {
                if (err) {
                  console.error('Lỗi khi lấy công thức:', err);
                  reject(err);
                } else {
                  console.log('Công thức đã lấy ra:', congthucResults);
                  congthucResults.forEach(ct => {
                    const totalDungTichCan = ct.DUNG_TICH_NL_CAN * item.SOLUONG;
                    console.log('Cập nhật nguyên liệu với ID_NL:', ct.ID_NL, 'và tổng dung tích cần:', totalDungTichCan);

                    nguyenLieuUpdates.push(
                      new Promise((resolve, reject) => {
                        db.query(
                          'UPDATE nguyenlieu SET DUNG_TICH_NL = DUNG_TICH_NL - ? WHERE ID_NL = ?',
                          [totalDungTichCan, ct.ID_NL],
                          (err, result) => {
                            if (err) {
                              console.error('Lỗi khi cập nhật nguyên liệu:', err);
                              reject(err);
                            } else {
                              console.log('Nguyên liệu cập nhật thành công với ID_NL:', ct.ID_NL);
                              resolve();
                            }
                          }
                        );
                      })
                    );
                  });
                  resolve();
                }
              });
            })
          );
        });

        // Thực hiện tất cả các truy vấn đã tạo
        Promise.all(chiTietHoaDonQueries)
        .then(() => Promise.all(nguyenLieuUpdates))
        .then(() => {
          // Xóa giỏ hàng sau khi thanh toán
          db.query('DELETE FROM giohangnhanvien WHERE ID_NV = ?', [idNhanVien], (err, result) => {
            if (err) {
              console.error('Lỗi khi xóa sản phẩm khỏi giỏ hàng sau khi thanh toán:', err);
              return res.status(500).send('Lỗi khi xóa sản phẩm khỏi giỏ hàng sau khi thanh toán.');
            }
            console.log('Giỏ hàng đã được xóa thành công.');
    
            // Lưu thông báo vào session
            req.session.successMessage = 'Thanh toán thành công!';
    
            // Chuyển hướng về trang /nhanvien/datnuoc
            res.redirect('/nhanvien/datnuoc');
          });
        })
        .catch(err => {
          console.error('Lỗi khi tạo hóa đơn hoặc cập nhật nguyên liệu:', err);
          res.status(500).send('Lỗi khi tạo hóa đơn hoặc cập nhật nguyên liệu.');
        });
      }
    );
  });
});
// Route GET để hiển thị quản lý hóa đơn
app.get('/quanly/quanlyhoadons', (req, res) => {
  const selectedMonth = req.query.month;
  const selectedYear = req.query.year;

  if (!selectedMonth || !selectedYear) {
    return res.render('quanly/quanlyhoadons', {
      selectedMonth,
      selectedYear,
      orders: [] // Trả về một mảng rỗng nếu tháng và năm chưa được chọn
    });
  }

  const query = `
SELECT 
  hd.ID_HD,
  hd.NGAYLAP_HD,
  hd.TONG_HD,
  hd.TRANGTHAI,
  hd.MOTA AS MOTAHUYDON, 
  hd.LOAI_TT AS LOAI_TT,
  nv.HOTEN_NV AS TEN_NHANVIEN,
  GROUP_CONCAT(
    CONCAT(
      'Tên: ', sp.TEN_SP, 
      ', Số Lượng: ', cthd.SOLUONG, 
      ', Giá: ', FORMAT(cthd.GIA_SP_HT, 0), 
      ', Kích thước: ', cthd.ID_KICH_THUOC
    ) ORDER BY sp.TEN_SP ASC SEPARATOR ', '
  ) AS DANH_SACH_SAN_PHAM
FROM 
  hoadon hd
JOIN 
  chitiethoadon cthd ON hd.ID_HD = cthd.ID_HD
JOIN 
  sanpham sp ON cthd.ID_SP = sp.ID_SP
JOIN
  nhanvien nv ON hd.ID_NV = nv.ID_NV
WHERE 
  MONTH(hd.NGAYLAP_HD) = ? 
  AND YEAR(hd.NGAYLAP_HD) = ?
GROUP BY 
  hd.ID_HD, hd.MOTA, hd.LOAI_TT, nv.HOTEN_NV
ORDER BY 
  hd.NGAYLAP_HD DESC;
  `;

  db.query(query, [selectedMonth, selectedYear], (err, results) => {
    if (err) {
      console.error('Error executing query', err);
      return res.status(500).send('Internal Server Error');
    }
    // Truyền dữ liệu đơn hàng trực tiếp vào view mà không cần sử dụng `donDatHang`
    res.render('quanly/quanlyhoadons', {
      selectedMonth,
      selectedYear,
      orders: results // Truyền kết quả từ truy vấn vào view với tên biến `orders`
    });
  });
});


app.get('/nhanvien/chamcong', (req, res) => {
  if (!req.session.idNhanVien) {
    return res.redirect('/'); // Chuyển hướng về trang đăng nhập nếu chưa đăng nhập
  }

  const employeeId = req.session.idNhanVien; // Lấy ID nhân viên đã đăng nhập từ phiên làm việc
  const { month } = req.query; // Lấy tháng từ query parameters

  const now = new Date();
  const utcHours = now.getUTCHours();
  const vietnamHours = (utcHours + 7) % 24; // Việt Nam cách UTC 7 giờ
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const currentHours = vietnamHours + minutes / 60 + seconds / 3600; // Tính giờ hiện tại

  let chamcongQuery = '';
  let chamcongParams = [];

  if (month) {
    chamcongQuery = `
      SELECT THOIGIANVAOCA, THOIGIANKETCA, lichlam.NGAY_L
      FROM CHAMCONG
      JOIN lichlam ON CHAMCONG.ID_LL = lichlam.ID_LL
      WHERE ID_NV = ? AND MONTH(lichlam.NGAY_L) = ?;
    `;
    chamcongParams = [employeeId, month];
  } else {
    chamcongQuery = `
      SELECT THOIGIANVAOCA, THOIGIANKETCA, lichlam.NGAY_L
      FROM CHAMCONG
      JOIN lichlam ON CHAMCONG.ID_LL = lichlam.ID_LL
      WHERE ID_NV = ?;
    `;
    chamcongParams = [employeeId];
  }

  db.query(chamcongQuery, chamcongParams, (err, chamcongResults) => {
    if (err) {
      console.error('Lỗi khi lấy dữ liệu chấm công:', err);
      return res.status(500).send('Đã xảy ra lỗi khi tải dữ liệu chấm công.');
    }

    const lichlamQuery = `
      SELECT 
        lichlam.*, 
        lichlam.ID_N, 
        nv1.HOTEN_NV AS CA_1_TEN_NV, 
        nv2.HOTEN_NV AS CA_2_TEN_NV, 
        nv3.HOTEN_NV AS CA_3_TEN_NV 
      FROM 
        lichlam
      LEFT JOIN 
        nhanvien nv1 ON lichlam.CA_1 = nv1.ID_NV
      LEFT JOIN 
        nhanvien nv2 ON lichlam.CA_2 = nv2.ID_NV
      LEFT JOIN 
        nhanvien nv3 ON lichlam.CA_3 = nv3.ID_NV
      JOIN 
        ngay n ON lichlam.ID_N = n.ID_N
      WHERE 
        n.NGAY_KT >= CURRENT_DATE;
    `;

    db.query(lichlamQuery, (err, lichlamResults) => {
      if (err) {
        console.error('Lỗi khi lấy dữ liệu lịch làm:', err);
        return res.status(500).send('Đã xảy ra lỗi khi tải dữ liệu lịch làm.');
      }

      res.render('nhanvien/chamcong', {
        attendances: chamcongResults,
        schedules: lichlamResults,
        currentHours: currentHours, // Sử dụng currentHours thay vì vietnamHours
        employeeId: employeeId // Truyền ID nhân viên hiện tại vào template
      });
    });
  });
});



app.post('/nhanvien/chamcong/start', (req, res) => {
  const currentTime = new Date(); // Lấy thời gian hiện tại
  const currentHour = currentTime.toTimeString().split(' ')[0]; // Lấy giờ hiện tại
  const employeeId = req.session.idNhanVien; // Lấy ID nhân viên đã đăng nhập từ phiên làm việc
  const shiftId = req.body.shiftId; // Lấy ID lịch làm ca từ form

  // Lấy thông tin ca làm việc dựa trên ID_LL
  const shiftQuery = `
    SELECT * FROM lichlam WHERE ID_LL = ?;
  `;

  db.query(shiftQuery, [shiftId], (err, results) => {
    if (err) {
      console.error('Lỗi khi truy vấn lịch làm:', err);
      return res.status(500).send('Đã xảy ra lỗi khi truy vấn lịch làm.');
    }

    if (results.length === 0) {
      return res.status(400).send('Không tìm thấy lịch làm việc.');
    }

    const shift = results[0];
    let expectedStartHour = '';
    let expectedEndHour = '';

    // Kiểm tra và xác định ca làm việc dựa trên thời gian hiện tại
    if (shift.CA_1 === employeeId && currentHour < '12:00:00') {
      expectedStartHour = '07:00:00'; // Ca 1: 7H-12H
      expectedEndHour = '12:00:00';
    }
    else if (shift.CA_2 === employeeId && currentHour >= '12:00:00' && currentHour < '17:00:00') {
      expectedStartHour = '12:00:00'; // Ca 2: 12H-17H
      expectedEndHour = '17:00:00';
    }
    else if (shift.CA_3 === employeeId && currentHour >= '17:00:00' && currentHour < '22:00:00') {
      expectedStartHour = '17:00:00'; // Ca 3: 17H-22H
      expectedEndHour = '22:00:00';
    }
    else {
      return res.status(400).send('Thời gian hiện tại không nằm trong khoảng thời gian của ca làm việc nào.');
    }

    // Tính thời gian đi trễ
    let timeLate = calculateLateTime(currentHour, expectedStartHour);

    // Thêm bản ghi mới vào bảng chấm công với thời gian vào ca, kết thúc ca và thời gian đi trễ
    const insertQuery = `
      INSERT INTO chamcong (THOIGIANVAOCA, THOIGIANKETCA, THOIGIAN_DI_TRE, ID_NV, ID_LL) 
      VALUES (?, ?, ?, ?, ?);
    `;

    db.query(insertQuery, [currentHour, expectedEndHour, timeLate, employeeId, shiftId], (err, result) => {
      if (err) {
        console.error('Lỗi khi chấm công:', err);
        return res.status(500).send('Đã xảy ra lỗi khi chấm công.');
      }

      res.redirect('/nhanvien/chamcong'); // Chuyển hướng về trang chấm công sau khi thành công
    });
  });
});

// Hàm tính thời gian đi trễ
function calculateLateTime(startHour, expectedStartHour) {
  const [startH, startM, startS] = startHour.split(':').map(Number);
  const [expectedH, expectedM, expectedS] = expectedStartHour.split(':').map(Number);

  const startInSeconds = startH * 3600 + startM * 60 + startS;
  const expectedInSeconds = expectedH * 3600 + expectedM * 60 + expectedS;

  const lateInSeconds = Math.max(0, startInSeconds - expectedInSeconds);

  const hoursLate = Math.floor(lateInSeconds / 3600).toString().padStart(2, '0');
  const minutesLate = Math.floor((lateInSeconds % 3600) / 60).toString().padStart(2, '0');
  const secondsLate = (lateInSeconds % 60).toString().padStart(2, '0');

  return `${hoursLate}:${minutesLate}:${secondsLate}`;
}


app.post('/nhanvien/chamcong/end', (req, res) => {
  const currentTime = new Date(); // Lấy thời gian hiện tại
  const currentHour = currentTime.toTimeString().split(' ')[0]; // Lấy giờ hiện tại
  const employeeId = req.session.idNhanVien; // Lấy ID nhân viên đã đăng nhập từ phiên làm việc
  const shiftId = req.body.shiftId; // Lấy ID lịch làm ca từ form

  const updateQuery = `
      UPDATE chamcong 
      SET THOIGIANKETCA = ? 
      WHERE ID_NV = ? AND ID_LL = ? AND THOIGIANVAOCA IS NOT NULL;
  `;

  db.query(updateQuery, [currentHour, employeeId, shiftId], (err, result) => {
    if (err) {
      console.error('Lỗi khi kết thúc ca:', err);
      return res.status(500).send('Đã xảy ra lỗi khi kết thúc ca.');
    }

    res.redirect('/nhanvien/chamcong'); // Chuyển hướng về trang chấm công sau khi thành công
  });
});


app.get('/nhanvien/dangkylam', (req, res) => {
  const idNhanVien = req.session.idNhanVien;

  // Truy vấn để lấy tất cả đăng ký ngày làm
  const selectDangKyNgayLamQuery = 'SELECT * FROM DANGKYNGAYLAM';

  // Truy vấn để lấy danh sách các ngày
  const selectNgayQuery = 'SELECT * FROM ngay WHERE NGAY_KT >= CURRENT_DATE';

  // Truy vấn để lấy danh sách các ID_N đã tồn tại trong bảng LICHLAM
  const selectLichLamQuery = 'SELECT * FROM LICHLAM';

  db.query(selectDangKyNgayLamQuery, (err, dangKyResults) => {
    if (err) {
      console.error(err);
      res.status(500).send('Lỗi khi truy vấn danh sách Đăng ký ngày làm');
    } else {
      const dangKyNgayLamList = dangKyResults;

      db.query(selectNgayQuery, (err, ngayResults) => {
        if (err) {
          console.error(err);
          res.status(500).send('Lỗi khi truy vấn danh sách Ngày');
        } else {
          const ngayList = ngayResults;

          // Truy vấn để lấy các ID_N đã tồn tại trong LICHLAM
          db.query(selectLichLamQuery, (err, lichLamResults) => {
            if (err) {
              console.error(err);
              res.status(500).send('Lỗi khi truy vấn danh sách Lịch làm');
            } else {
              // Lấy danh sách ID_N từ kết quả truy vấn
              const lichLamIdList = lichLamResults;
              res.render('nhanvien/dangkylam', {
                dangKyNgayLamList: dangKyNgayLamList,
                ngayList: ngayList,
                lichLamIdList: lichLamIdList, // Gửi danh sách ID_N từ LICHLAM đến view
                idNhanVien: idNhanVien
              });
            }
          });
        }
      });
    }
  });
});

app.post('/nhanvien/dangkylam', (req, res) => {
  const idNhanVien = req.session.idNhanVien; // Lấy giá trị idNhanVien từ session, hãy đảm bảo rằng đã cấu hình session trong ứng dụng Node.js
  const id_n = req.body.id_n;  // Lấy giá trị ngayID từ body của yêu cầu POST

  if (!id_n) {
    const successMessage = 'Lịch làm chưa sẵn sàng để đăng ký, vui lòng chờ!';
    const redirectUrl = 'http://localhost:3000/nhanvien/dangkylam';
    const script = `
  <script>
    alert('${successMessage}');
    window.location.href = '${redirectUrl}';
  </script>
`;
    res.send(script);
    return;
  }
  // Kiểm tra xem id_n đã được đăng ký bởi idNhanVien hay chưa bằng cách thực hiện truy vấn SELECT
  const checkDangKyQuery = 'SELECT * FROM dangkyngaylam WHERE ID_NV = ? AND ID_N = ?';
  db.query(checkDangKyQuery, [idNhanVien, id_n], (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send('Lỗi khi kiểm tra dữ liệu đăng ký');
    } else {
      // Kiểm tra kết quả truy vấn
      if (results.length > 0) {
        // id_n đã được đăng ký bởi idNhanVien, không cho phép đăng ký lại
        res.status(400).send('Bạn đã đăng ký lịch làm cho ngày này trước đó');
      } else {
        // Thực hiện truy vấn INSERT hoặc UPDATE để đăng ký lịch làm
        const insertDangKyQuery = 'INSERT INTO dangkyngaylam (ID_NV, ID_N) VALUES (?, ?)';
        db.query(insertDangKyQuery, [idNhanVien, id_n], (err, results) => {
          if (err) {
            console.error(err);
            res.status(500).send('Lỗi khi thêm dữ liệu đăng ký');
          } else {
            res.redirect('/nhanvien/dangkylam');
          }
        });
      }
    }
  });
});
app.post('/nhanvien/dangkylam/capnhat', (req, res) => {
  const idNhanVien = req.body.idN;
  const id_n = req.body.id_n;
  const ngaydk = {
    NGAYDK_1: [],
    NGAYDK_2: [],
    NGAYDK_3: [],
    NGAYDK_4: [],
    NGAYDK_5: [],
    NGAYDK_6: [],
    NGAYDK_7: []
  };
  req.body.NGAYDK.forEach(value => {
    const [ca, ngayIndex] = value.split('_');
    ngaydk[`NGAYDK_${parseInt(ngayIndex) + 1}`].push(ca);
  });

  // Chuyển đổi mảng thành chuỗi JSON
  for (let i = 1; i <= 7; i++) {
    ngaydk[`NGAYDK_${i}`] = JSON.stringify(ngaydk[`NGAYDK_${i}`]);
  }

  const sql = `
    UPDATE DANGKYNGAYLAM
    SET
      NGAYDK_1 = ?,
      NGAYDK_2 = ?,
      NGAYDK_3 = ?,
      NGAYDK_4 = ?,
      NGAYDK_5 = ?,
      NGAYDK_6 = ?,
      NGAYDK_7 = ?
    WHERE ID_NV = ? AND ID_N = ?
  `;
  const values = [
    ngaydk.NGAYDK_1,
    ngaydk.NGAYDK_2,
    ngaydk.NGAYDK_3,
    ngaydk.NGAYDK_4,
    ngaydk.NGAYDK_5,
    ngaydk.NGAYDK_6,
    ngaydk.NGAYDK_7,
    idNhanVien,
    id_n
  ];

  db.query(sql, values, (error, results) => {
    if (error) {
      console.error('Lỗi khi cập nhật dữ liệu:', error);
      res.status(500).send('Lỗi khi cập nhật dữ liệu');
    } else {
      const successMessage = 'Đăng ký lịch làm thành công.';
      const redirectUrl = '/nhanvien/dangkylam';
      const script = `
        <script>
          alert('${successMessage}');
          window.location.href = '${redirectUrl}';
        </script>
      `;
      res.send(script);
    }
  });
});
// Xử lý POST xóa lịch làm
app.post('/nhanvien/xoalichlam/:id', (req, res) => {
  const lichlamId = req.params.id;
  // Thực hiện xử lý xóa lịch làm cho lichlamId
  const deleteQuery = `
      DELETE FROM DANGKYNGAYLAM
      WHERE  ID_DKNL = ?;
  `;
  const values = [lichlamId];
  db.query(deleteQuery, values, (error, results) => {
    if (error) {
      console.error('Error executing query:', error);
      res.status(500).send('Internal Server Error');
    } else {
      res.redirect('/nhanvien/dangkylam');
    }
  });
});
// Định tuyến GET cho trang Hiển thị lịch làm chính thức
app.get('/nhanvien/lichlamchinhthuc', (req, res) => {
  const idNhanVien = req.session.idNhanVien;

  // Truy vấn thông tin lịch làm việc và nhân viên
  const lichlamQuery = `
    SELECT 
      lichlam.*, 
      lichlam.ID_N, 
      nv1.HOTEN_NV AS CA_1_TEN_NV, 
      nv2.HOTEN_NV AS CA_2_TEN_NV, 
      nv3.HOTEN_NV AS CA_3_TEN_NV 
    FROM 
      lichlam
    LEFT JOIN 
      nhanvien nv1 ON lichlam.CA_1 = nv1.ID_NV
    LEFT JOIN 
      nhanvien nv2 ON lichlam.CA_2 = nv2.ID_NV
    LEFT JOIN 
      nhanvien nv3 ON lichlam.CA_3 = nv3.ID_NV
    JOIN 
      ngay n ON lichlam.ID_N = n.ID_N
    WHERE 
      n.NGAY_KT >= CURRENT_DATE;`;

  const nhanvienQuery = 'SELECT * FROM nhanvien';

  // Truy vấn thông tin yêu cầu thay ca
  const yeucauthaycaQuery = `
    SELECT 
      yeucauthayca.*,
      nv_current.HOTEN_NV AS TEN_NV_CURRENT,
      nv_replace.HOTEN_NV AS TEN_NV_REPLACE
    FROM 
      yeucauthayca
    JOIN 
      nhanvien nv_current ON yeucauthayca.NHANVIEN_YEUCAU = nv_current.ID_NV
    JOIN 
      nhanvien nv_replace ON yeucauthayca.NHANVIEN_THAYCA = nv_replace.ID_NV;`;

  // Truy vấn thông tin yêu cầu xin nghỉ phép
  const xinNghePhepQuery = `
    SELECT 
      xnp.XACNHAN_QL, 
      xnp.MOTA, 
      xnp.CALAMMUONNGHI, 
      xnp.ID_XNP, 
      xnp.NGAY_L, 
      nv.HOTEN_NV 
    FROM 
      xinnghiphep xnp
    JOIN 
      nhanvien nv ON xnp.ID_NV = nv.ID_NV
    WHERE 
      nv.ID_NV = ?;`;

  // Thực hiện các truy vấn đồng thời
  db.query(lichlamQuery, (err, lichlamtong) => {
    if (err) {
      console.error('Lỗi truy vấn lichlam: ' + err.stack);
      res.status(500).send('Lỗi khi lấy dữ liệu từ CSDL');
      return;
    }

    db.query(nhanvienQuery, (err, nhanvienRows) => {
      if (err) {
        console.error('Lỗi truy vấn nhanvien: ' + err.stack);
        res.status(500).send('Lỗi khi lấy dữ liệu từ CSDL');
        return;
      }

      db.query(yeucauthaycaQuery, [idNhanVien, idNhanVien], (err, yeucauthaycaRows) => {
        if (err) {
          console.error('Lỗi truy vấn yeucauthayca: ' + err.stack);
          res.status(500).send('Lỗi khi lấy dữ liệu từ CSDL');
          return;
        }

        db.query(xinNghePhepQuery, [idNhanVien], (err, xinNghePhepRows) => {
          if (err) {
            console.error('Lỗi truy vấn xin nghỉ phép: ' + err.stack);
            res.status(500).send('Lỗi khi lấy dữ liệu từ CSDL');
            return;
          }

          // Lọc các ca làm của nhân viên hiện tại
          const caLamCuaNhanVien = lichlamtong.filter(row =>
            row.CA_1 === idNhanVien ||
            row.CA_2 === idNhanVien ||
            row.CA_3 === idNhanVien
          );

          // Render template EJS và truyền dữ liệu
          res.render('nhanvien/lichlamchinhthuc', {
            lichlam: caLamCuaNhanVien,
            lichlamtong: lichlamtong,
            nhanviens: nhanvienRows,
            yeucauthayca: yeucauthaycaRows,
            xinNghePhep: xinNghePhepRows,
            idNhanVien: idNhanVien
          });
        });
      });
    });
  });
});


app.post('/nhanvien/lichlamchinhthuc/timlichlam', (req, res) => {
  const ngayLam = req.body.ngay_l;
  console.log('Ngày làm nhận được:', ngayLam); // Thêm log để kiểm tra giá trị
  const query = 'SELECT ID_LL, NGAY_L, CA_1, CA_2, CA_3 FROM lichlam WHERE NGAY_L = ?';
  db.query(query, [ngayLam], (err, results) => {
    if (err) {
      console.error('Lỗi khi tìm lịch làm:', err);
      return res.status(500).send('Đã xảy ra lỗi khi tìm lịch làm.');
    }
    console.log('Kết quả truy vấn:', results); // Thêm log để kiểm tra kết quả
    res.json(results);
  });
});
app.post('/nhanvien/xinnghiphep', (req, res) => {
  // Nên thêm validation

  // Thêm try-catch để xử lý lỗi tốt hơn
  try {
    const { ID_LL, ID_NV, ngay_l, ca_nghi, mota } = req.body;
    const query = `
      INSERT INTO xinnghiphep (ID_LL, ID_NV, NGAY_L, CALAMMUONNGHI, MOTA, XACNHAN_QL) 
      VALUES (?, ?, ?, ?, ?, 0)
    `;

    db.query(query, [ID_LL, ID_NV, ngay_l, ca_nghi, mota], (err, result) => {
      if (err) {
        console.error('Lỗi khi xử lý yêu cầu nghỉ phép:', err);
        return res.status(500).send('Đã xảy ra lỗi khi gửi yêu cầu nghỉ phép.');
      }
      res.send('Yêu cầu nghỉ phép của bạn đã được gửi thành công.');
    });
  } catch (error) {
    console.error('Lỗi:', error);
    res.status(500).send('Đã xảy ra lỗi trong quá trình xử lý.');
  }
});
app.post('/nhanvien/xinnghiphep/xoa', (req, res) => {
  const idXNP = req.body.ID_XNP; // Lấy ID đơn xin nghỉ phép cần xóa
  const idNhanVien = req.session.idNhanVien; // Lấy ID nhân viên từ session

  // Kiểm tra xem đơn có thuộc về nhân viên này không
  const checkQuery = `
    SELECT * FROM xinnghiphep 
    WHERE ID_XNP = ? AND ID_NV = ?
  `;

  db.query(checkQuery, [idXNP, idNhanVien], (err, results) => {
    if (err) {
      console.error('Lỗi khi kiểm tra đơn xin nghỉ phép:', err);
      return res.status(500).send('Đã xảy ra lỗi khi xóa đơn xin nghỉ phép.');
    }

    // Nếu không tìm thấy đơn hoặc đơn không thuộc về nhân viên này
    if (results.length === 0) {
      return res.status(403).send('Không có quyền xóa đơn xin nghỉ phép này.');
    }

    // Kiểm tra trạng thái xác nhận của đơn
    if (results[0].XACNHAN_QL !== 0) {
      return res.status(400).send('Không thể xóa đơn đã được quản lý xử lý.');
    }

    // Thực hiện xóa đơn
    const deleteQuery = `
      DELETE FROM xinnghiphep 
      WHERE ID_XNP = ? AND ID_NV = ?
    `;

    db.query(deleteQuery, [idXNP, idNhanVien], (deleteErr) => {
      if (deleteErr) {
        console.error('Lỗi khi xóa đơn xin nghỉ phép:', deleteErr);
        return res.status(500).send('Đã xảy ra lỗi khi xóa đơn xin nghỉ phép.');
      }

      // Chuyển hướng về trang lịch làm chính thức sau khi xóa thành công
      res.redirect('/nhanvien/lichlamchinhthuc');
    });
  });
});
app.post('/nhanvien/yeucauthayca', (req, res) => {
  // Lấy dữ liệu từ form
  const { NHANVIEN_YEUCAU, ID_LL, NGAY_L, CALAMMUONTHAY, NHANVIEN_THAYCA, MOTA } = req.body;

  // Câu lệnh SQL để chèn dữ liệu vào bảng `yeucauthayca`
  const query = `
    INSERT INTO yeucauthayca (ID_LL, NGAY_L, CALAMMUONTHAY, NHANVIEN_THAYCA, MOTA, NHANVIEN_YEUCAU)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  // Thực thi câu lệnh SQL
  db.query(query, [ID_LL, NGAY_L, CALAMMUONTHAY, NHANVIEN_THAYCA, MOTA, NHANVIEN_YEUCAU], (err, result) => {
    if (err) {
      console.error('Lỗi khi gửi yêu cầu:', err);
      res.status(500).send('Có lỗi xảy ra khi gửi yêu cầu.');
      return;
    }

    console.log('Yêu cầu thay ca đã được gửi!');
    res.redirect('/nhanvien/lichlamchinhthuc'); // Redirect đến trang yêu cầu thay ca hoặc trang khác
  });
});
app.post('/nhanvien/yeucauthayca/xoa', (req, res) => {
  const idYCTC = req.body.ID_YCTC;

  // Thực hiện truy vấn xóa bản ghi theo ID_YCTC
  db.query('DELETE FROM yeucauthayca WHERE ID_YCTC = ?', [idYCTC], (err, results) => {
    if (err) {
      // Xử lý lỗi nếu có
      console.error('Lỗi khi xóa yêu cầu thay ca:', err);
      return res.status(500).send('Có lỗi xảy ra khi xóa yêu cầu.');
    }

    // Chuyển hướng hoặc gửi phản hồi sau khi xóa thành công
    res.redirect('/nhanvien/lichlamchinhthuc'); // Chuyển hướng đến trang danh sách yêu cầu thay ca
  });
});
// Route xử lý yêu cầu xác nhận
app.post('/nhanvien/yeucau/xacnhan', (req, res) => {
  const idYCTC = req.body.id;

  // Cập nhật trạng thái xác nhận nhân viên thay ca (ví dụ, XACNHAN_NVTC = 1)
  db.query('UPDATE yeucauthayca SET XACNHAN_NVTC = 1 WHERE ID_YCTC = ?', [idYCTC], (err, results) => {
    if (err) {
      console.error('Lỗi khi xác nhận yêu cầu thay ca:', err);
      return res.status(500).send('Có lỗi xảy ra khi xác nhận yêu cầu.');
    }
    // Chuyển hướng hoặc gửi phản hồi sau khi xác nhận thành công
    res.redirect('/nhanvien/lichlamchinhthuc'); // Chuyển hướng đến trang danh sách yêu cầu thay ca
  });
});
// Route xử lý yêu cầu từ chối
app.post('/nhanvien/yeucau/huy', (req, res) => {
  const idYCTC = req.body.id;

  // Cập nhật trạng thái từ chối yêu cầu thay ca (ví dụ, XACNHAN_NVTC = 2)
  db.query('UPDATE yeucauthayca SET XACNHAN_NVTC = 2 WHERE ID_YCTC = ?', [idYCTC], (err, results) => {
    if (err) {
      console.error('Lỗi khi từ chối yêu cầu thay ca:', err);
      return res.status(500).send('Có lỗi xảy ra khi từ chối yêu cầu.');
    }

    // Chuyển hướng hoặc gửi phản hồi sau khi từ chối thành công
    res.redirect('/nhanvien/lichlamchinhthuc'); // Chuyển hướng đến trang danh sách yêu cầu thay ca
  });
});
// Định tuyến GET cho trang Xem thông tin cá nhân
app.get('/nhanvien/xemthongtin', (req, res) => {
  // Kiểm tra phiên đã đăng nhập
  const successMessage = req.session.successMessage; // Lấy thông báo từ session
  delete req.session.successMessage; // Xóa thông báo sau khi đã sử dụng
  if (!req.session.idNhanVien) {
    return res.redirect('/'); // Chuyển hướng về trang đăng nhập nếu chưa đăng nhập
  }

  const idNhanVien = req.session.idNhanVien; // Lấy ID nhân viên từ session

  // Thực hiện các truy vấn SQL
  const sqlQueries = {
    // Câu truy vấn để lấy thông tin nhân viên
    employeeInfo: 'SELECT * FROM NHANVIEN WHERE ID_NV = ?',

    // Câu truy vấn để đếm số lần đi trễ trong tháng
    soLanDiTreTrongThang: `
  SELECT COUNT(chamcong.THOIGIAN_DI_TRE) AS SO_LAN_DI_TRE
  FROM chamcong
  JOIN lichlam ON chamcong.ID_LL = lichlam.ID_LL
  WHERE chamcong.ID_NV = ? 
    AND chamcong.THOIGIAN_DI_TRE > 0 
    AND MONTH(lichlam.NGAY_L) = MONTH(CURDATE()) 
    AND YEAR(lichlam.NGAY_L) = YEAR(CURDATE())
`
    ,
    tongSoLyBanDuoc: `
      SELECT SUM(chitiethoadon.SOLUONG) AS TONG_SO_LY_BAN_DUOC
      FROM chitiethoadon
      JOIN hoadon ON chitiethoadon.ID_HD = hoadon.ID_HD
      WHERE hoadon.ID_NV = ? 
      AND MONTH(hoadon.NGAYLAP_HD) = MONTH(CURDATE()) 
      AND YEAR(hoadon.NGAYLAP_HD) = YEAR(CURDATE())
    `,
    tongSoHoaDonHuy: `
      SELECT COUNT(hoadon.ID_HD) AS TONG_SO_HOA_DON_HUY
      FROM hoadon
      WHERE hoadon.ID_NV = ? 
      AND hoadon.TRANGTHAI = 'Đã hủy' 
      AND MONTH(hoadon.NGAYLAP_HD) = MONTH(CURDATE()) 
      AND YEAR(hoadon.NGAYLAP_HD) = YEAR(CURDATE())
    `,
    tongSoNgayLam: `
      SELECT COUNT(DISTINCT lichlam.NGAY_L) AS TONG_SO_NGAY_LAM
      FROM lichlam
      WHERE (lichlam.CA_1 = ? OR lichlam.CA_2 = ? OR lichlam.CA_3 = ?) 
      AND MONTH(lichlam.NGAY_L) = MONTH(CURDATE()) 
      AND YEAR(lichlam.NGAY_L) = YEAR(CURDATE())
    `
  };

  // Thực hiện truy vấn
  db.query(sqlQueries.employeeInfo, [idNhanVien], (err, result) => {
    if (err) {
      console.error('Lỗi khi lấy thông tin nhân viên:', err);
      return res.status(500).send('Đã xảy ra lỗi khi tải thông tin nhân viên.');
    }

    const employee = result[0]; // Lấy thông tin nhân viên từ kết quả truy vấn

    // Thực hiện các truy vấn khác song song
    db.query(sqlQueries.soLanDiTreTrongThang, [idNhanVien], (err, result2) => {
      if (err) {
        console.error('Lỗi khi lấy số lần đi trễ trong tháng:', err);
        return res.status(500).send('Đã xảy ra lỗi khi lấy số lần đi trễ trong tháng.');
      }

      db.query(sqlQueries.tongSoLyBanDuoc, [idNhanVien], (err, result3) => {
        if (err) {
          console.error('Lỗi khi lấy tổng số ly bán được:', err);
          return res.status(500).send('Đã xảy ra lỗi khi lấy tổng số ly bán được.');
        }

        db.query(sqlQueries.tongSoHoaDonHuy, [idNhanVien], (err, result4) => {
          if (err) {
            console.error('Lỗi khi lấy tổng số hóa đơn hủy:', err);
            return res.status(500).send('Đã xảy ra lỗi khi lấy tổng số hóa đơn hủy.');
          }

          db.query(sqlQueries.tongSoNgayLam, [idNhanVien, idNhanVien, idNhanVien], (err, result5) => {
            if (err) {
              console.error('Lỗi khi lấy tổng số ngày làm:', err);
              return res.status(500).send('Đã xảy ra lỗi khi lấy tổng số ngày làm.');
            }

            // Render trang xem thông tin cá nhân và truyền tất cả dữ liệu vào template
            res.render('nhanvien/xemthongtin', {
              successMessage ,
              employee,
              soLanDiTreTrongThang: result2[0]?.SO_LAN_DI_TRE || 0,
              tongSoLyBanDuoc: result3[0]?.TONG_SO_LY_BAN_DUOC || 0,
              tongSoHoaDonHuy: result4[0]?.TONG_SO_HOA_DON_HUY || 0,
              tongSoNgayLam: result5[0]?.TONG_SO_NGAY_LAM || 0
            });
          });
        });
      });
    });
  });
});

app.post('/nhanvien/capnhatthongtin', upload.single('anh'), (req, res) => {
  const employeeId = req.session.idNhanVien; // Lấy ID nhân viên từ session
  const { ten, email, sodienthoai, quequan } = req.body; // Lấy thông tin từ form

  // Kiểm tra nếu có ảnh được tải lên
  let anhPath = req.file ? '/uploads/' + req.file.filename : req.body.anh_cu;

  // Truy vấn SQL để cập nhật thông tin nhân viên
  const query = `
    UPDATE nhanvien 
    SET HOTEN_NV = ?, GMAIL_NV = ?, SODIENTHOAI_NV = ?, QUEQUAN_NV = ?, ANH = ?
    WHERE ID_NV = ?;
  `;
  const params = [ten, email, sodienthoai, quequan, anhPath, employeeId];

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Lỗi khi cập nhật thông tin nhân viên:', err);
      return res.status(500).send('Đã xảy ra lỗi khi cập nhật thông tin.');
    }

    // Lưu thông báo vào session
    req.session.successMessage = 'Cập nhật thông tin thành công!';
    res.redirect('/nhanvien/xemthongtin'); // Chuyển hướng về trang hồ sơ
  });
});


// Định tuyến GET cho trang Kiểm nguyên liệu
app.get('/nhanvien/nguyenlieu', (req, res) => {
  const query = 'SELECT * FROM nguyenlieu WHERE DUNG_TICH_NL <= 400';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Lỗi khi lấy dữ liệu nguyên liệu:', err);
      return res.status(500).send('Đã xảy ra lỗi khi lấy dữ liệu nguyên liệu.');
    }
    const nguyenlieu = results;
    res.render('nhanvien/nguyenlieu', { nguyenlieu }); // Render trang EJS tương ứng
  });
});
app.get('/nhanvien/nguyenlieusaphet', (req, res) => {
  const query = 'SELECT COUNT(*) AS count FROM nguyenlieu WHERE DUNG_TICH_NL <= 400';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Lỗi khi lấy dữ liệu nguyên liệu:', err);
      return res.status(500).send('Đã xảy ra lỗi khi lấy dữ liệu nguyên liệu.');
    }
    const count = results[0].count;
    res.json({ count });
  });
});
app.get('/khachhang', (req, res) => {
  res.render('khachhang');
});
app.get('/khachhang/kh_sanpham', (req, res) => {
  const querySanPham = 'SELECT * FROM SANPHAM';
  const successMessage = req.session.successMessage;
  delete req.session.successMessage; // Xóa thông báo sau khi đã truyền đi
  const queryGioHang = `
    SELECT gh.ID_GH, gh.SOLUONG, sp.ID_SP, sp.TEN_SP, sp.GIA_SP, sp.ANH_SP, kt.ID_KICH_THUOC, kt.TEN_KICH_THUOC, gh.GIA_UOCTINH,sp.ID_DM
    FROM GIOHANG gh
    JOIN SANPHAM sp ON gh.ID_SP = sp.ID_SP
    LEFT JOIN KICHTHUOC kt ON gh.ID_KICH_THUOC = kt.ID_KICH_THUOC
    WHERE gh.ID_KH = ?`;
  const queryKichThuoc = 'SELECT * FROM KICHTHUOC';
  const queryDanhMuc = 'SELECT * FROM DANHMUC';
  const queryNguyenLieu = `
    SELECT ct.ID_SP, nl.TEN_NL, nl.DUNG_TICH_NL, ct.DUNG_TICH_NL_CAN
    FROM congthuc ct
    JOIN nguyenlieu nl ON ct.ID_NL = nl.ID_NL`;
  const ID_KH = req.session.idKhachHang;

  // Lấy danh sách sản phẩm
  db.query(querySanPham, (errSanPham, sanphamData) => {
    if (errSanPham) {
      console.error('Lỗi khi lấy danh sách sản phẩm:', errSanPham);
      return res.status(500).send('Lỗi máy chủ nội bộ');
    }

    // Lấy danh sách kích thước
    db.query(queryKichThuoc, (errKichThuoc, kichthuocData) => {
      if (errKichThuoc) {
        console.error('Lỗi khi lấy danh sách kích thước:', errKichThuoc);
        return res.status(500).send('Lỗi máy chủ nội bộ');
      }

      // Lấy giỏ hàng của khách hàng
      db.query(queryGioHang, [ID_KH], (errGioHang, gioHangData) => {
        if (errGioHang) {
          console.error('Lỗi khi lấy giỏ hàng:', errGioHang);
          return res.status(500).send('Lỗi máy chủ nội bộ');
        }

        // Lấy danh sách danh mục
        db.query(queryDanhMuc, (errDanhMuc, danhmucData) => {
          if (errDanhMuc) {
            console.error('Lỗi khi lấy danh sách danh mục:', errDanhMuc);
            return res.status(500).send('Lỗi máy chủ nội bộ');
          }

          // Lấy thông tin nguyên liệu và công thức
          db.query(queryNguyenLieu, (errNguyenLieu, nguyenlieuData) => {
            if (errNguyenLieu) {
              console.error('Lỗi khi lấy thông tin nguyên liệu:', errNguyenLieu);
              return res.status(500).send('Lỗi máy chủ nội bộ');
            }

            // Tính toán số ly có thể làm được từ nguyên liệu hiện có cho mỗi sản phẩm
            const lyMap = sanphamData.reduce((acc, product) => {
              const productIngredients = nguyenlieuData.filter(ingredient => ingredient.ID_SP === product.ID_SP);
              const lyCounts = productIngredients.map(ingredient => Math.floor(ingredient.DUNG_TICH_NL / ingredient.DUNG_TICH_NL_CAN));
              const minLyCount = Math.min(...lyCounts);
              acc[product.ID_SP] = minLyCount;
              return acc;
            }, {});

            // Cập nhật trạng thái sản phẩm dựa trên số ly có thể làm được
            sanphamData.forEach(product => {
              product.TRANGTHAI_SP = lyMap[product.ID_SP] <= 1 ? 'Hết' : 'Còn';
            });

            // Logic để gộp các sản phẩm trong giỏ hàng với nhau
            let mergedCart = [];
            gioHangData.forEach(item => {
              let existingItem = mergedCart.find(cartItem =>
                cartItem.ID_SP === item.ID_SP && cartItem.ID_KICH_THUOC === item.ID_KICH_THUOC
              );
              if (existingItem) {
                // Nếu sản phẩm đã tồn tại trong giỏ hàng gộp, tăng số lượng
                existingItem.SOLUONG += item.SOLUONG;
              } else {
                // Nếu chưa tồn tại, thêm vào giỏ hàng gộp
                mergedCart.push({
                  ID_GH: item.ID_GH,
                  ID_DM: item.ID_DM,
                  SOLUONG: item.SOLUONG,
                  ID_SP: item.ID_SP,
                  TEN_SP: item.TEN_SP,
                  GIA_SP: item.GIA_SP,
                  ANH_SP: item.ANH_SP,
                  ID_KICH_THUOC: item.ID_KICH_THUOC,
                  TEN_KICH_THUOC: item.TEN_KICH_THUOC,
                  GIA_UOCTINH: item.GIA_UOCTINH // Thêm giá ước tính vào dữ liệu giỏ hàng gộp
                });
              }
            });

            // Render view và truyền dữ liệu
            res.render('khachhang/kh_sanpham', {
              sanpham: sanphamData,
              gioHang: mergedCart, // Sử dụng giỏ hàng đã được gộp
              kichthuoc: kichthuocData,
              danhmuc: danhmucData, // Truyền dữ liệu danh mục vào view
              lyMap, // Truyền dữ liệu lyMap vào view
              successMessage // Truyền thông báo thành công vào view nếu có
            });
          });
        });
      });
    });
  });
});
// ... existing code ...

// Route xóa tất cả sản phẩm trong giỏ hàng
app.post('/khachhang/xoa_tatca_giohang', (req, res) => {
  // Lấy ID khách hàng từ session
  const idKhachHang = req.session.idKhachHang;

  if (!idKhachHang) {
    return res.json({
      success: false,
      message: 'Không tìm thấy thông tin khách hàng'
    });
  }
// Route xóa tất cả sản phẩm trong giỏ hàng nhân viên
app.post('/nhanvien/xoa_tatca_giohang', (req, res) => {
  const idNhanVien = req.session.idNhanVien;

  if (!idNhanVien) {
    return res.json({
      success: false,
      message: 'Không tìm thấy thông tin nhân viên'
    });
  }

  // Query xóa tất cả sản phẩm trong giỏ hàng của nhân viên
  const query = 'DELETE FROM giohang_nv WHERE ID_NV = ?';

  db.query(query, [idNhanVien], (err, result) => {
    if (err) {
      console.error('Lỗi khi xóa giỏ hàng:', err);
      return res.json({
        success: false,
        message: 'Đã xảy ra lỗi khi xóa giỏ hàng'
      });
    }

    res.json({
      success: true,
      message: 'Đã xóa tất cả sản phẩm trong giỏ hàng'
    });
  });
});
  // Query xóa tất cả sản phẩm trong giỏ hàng của khách hàng
  const query = 'DELETE FROM giohang WHERE ID_KH = ?';

  db.query(query, [idKhachHang], (err, result) => {
    if (err) {
      console.error('Lỗi khi xóa giỏ hàng:', err);
      return res.json({
        success: false,
        message: 'Đã xảy ra lỗi khi xóa giỏ hàng'
      });
    }

    res.json({
      success: true,
      message: 'Đã xóa tất cả sản phẩm trong giỏ hàng'
    });
  });
});

// ... existing code ...
app.post('/khachhang/kh_giohang', (req, res) => {
  const { sp_id, soluong, kichthuoc, gia_uoctinh } = req.body; // Lấy ID_SP, số lượng, ID_KICH_THUOC và giá ước tính từ form
  // Lấy ID_KH từ session
  const ID_KH = req.session.idKhachHang;
  // Kiểm tra xem sản phẩm đã có trong giỏ hàng của khách hàng chưa
  const checkQuery = 'SELECT * FROM GIOHANG gh ' +
    'WHERE gh.ID_SP = ? AND gh.ID_KH = ? AND gh.ID_KICH_THUOC = ?';
  db.query(checkQuery, [sp_id, ID_KH, kichthuoc], (err, rows) => {
    if (err) {
      console.error('Lỗi khi kiểm tra giỏ hàng:', err);
      return res.status(500).send('Đã xảy ra lỗi khi thêm vào giỏ hàng.');
    }
    if (rows.length > 0) {
      // Nếu sản phẩm đã có trong giỏ hàng, cập nhật số lượng
      const updateQuery = 'UPDATE GIOHANG SET SOLUONG = SOLUONG + ?, GIA_UOCTINH = ? WHERE ID_SP = ? AND ID_KH = ? AND ID_KICH_THUOC = ?';
      db.query(updateQuery, [soluong, gia_uoctinh, sp_id, ID_KH, kichthuoc], (updateErr, updateResult) => {
        if (updateErr) {
          console.error('Lỗi khi cập nhật số lượng sản phẩm trong giỏ hàng:', updateErr);
          return res.status(500).send('Đã xảy ra lỗi khi thêm vào giỏ hàng.');
        }
        // Chuyển hướng hoặc render lại trang giỏ hàng
        res.redirect('/khachhang/kh_sanpham');
      });
    } else {
      // Nếu sản phẩm chưa có trong giỏ hàng, thêm mới vào
      const insertQuery = 'INSERT INTO GIOHANG (SOLUONG, ID_SP, ID_KH, ID_KICH_THUOC, GIA_UOCTINH) VALUES (?, ?, ?, ?, ?)';

      db.query(insertQuery, [soluong, sp_id, ID_KH, kichthuoc, gia_uoctinh], (insertErr, insertResult) => {
        if (insertErr) {
          console.error('Lỗi khi thêm vào giỏ hàng:', insertErr);
          return res.status(500).send('Đã xảy ra lỗi khi thêm vào giỏ hàng.');
        }
        // Chuyển hướng hoặc render lại trang giỏ hàng
        res.redirect('/khachhang/kh_sanpham');
      });
    }
  });
});
app.post('/khachhang/xoa_giohang/:id', (req, res) => {
  const idGioHang = req.params.id;

  const query = `
    DELETE FROM giohang
    WHERE ID_GH = ?
  `;

  db.query(query, [idGioHang], (err, results) => {
    if (err) {
      console.error('Lỗi khi xóa khỏi giỏ hàng:', err);
      return res.status(500).send('Lỗi máy chủ nội bộ');
    }
    res.redirect('/khachhang/kh_sanpham');
  });
});
app.get('/khachhang/kh_yeuthich', (req, res) => {
  // Kiểm tra phiên đã đăng nhập
  if (!req.session.idKhachHang) {
    return res.redirect('/'); // Chuyển hướng về trang đăng nhập nếu chưa đăng nhập
  }

  const customerId = req.session.idKhachHang; // Lấy ID khách hàng đã đăng nhập từ phiên làm việc

  // Truy vấn SQL để lấy sản phẩm yêu thích duy nhất cho mỗi ID_SP
  const queryFavoriteProducts = `
    SELECT DISTINCT sanpham.ID_SP, sanpham.TEN_SP, sanpham.GIA_SP, sanpham.ANH_SP
    FROM YEUTHICH
    JOIN SANPHAM ON YEUTHICH.ID_SP = SANPHAM.ID_SP
    WHERE YEUTHICH.ID_KH = ?;
  `;

  // Truy vấn SQL để lấy các sản phẩm chưa được yêu thích
  const queryNotFavoriteProducts = `
    SELECT sanpham.ID_SP, sanpham.TEN_SP, sanpham.GIA_SP, sanpham.ANH_SP
    FROM sanpham
    LEFT JOIN yeuthich ON sanpham.ID_SP = yeuthich.ID_SP AND yeuthich.ID_KH = ?
    WHERE yeuthich.ID_SP IS NULL;
  `;

  db.query(queryFavoriteProducts, [customerId], (err, favoriteResults) => {
    if (err) {
      console.error('Lỗi khi lấy dữ liệu sản phẩm yêu thích:', err);
      return res.status(500).send('Đã xảy ra lỗi khi tải dữ liệu sản phẩm yêu thích.');
    }

    db.query(queryNotFavoriteProducts, [customerId], (err, notFavoriteResults) => {
      if (err) {
        console.error('Lỗi khi lấy dữ liệu sản phẩm chưa yêu thích:', err);
        return res.status(500).send('Đã xảy ra lỗi khi tải dữ liệu sản phẩm chưa yêu thích.');
      }

      // Render template với dữ liệu sản phẩm yêu thích và chưa yêu thích
      res.render('khachhang/kh_yeuthich', { favoriteProducts: favoriteResults, notFavoriteProducts: notFavoriteResults });
    });
  });
});

app.post('/khachhang/yeuthich/remove', (req, res) => {
  // Kiểm tra phiên đã đăng nhập
  if (!req.session.idKhachHang) {
    return res.redirect('/'); // Chuyển hướng về trang đăng nhập nếu chưa đăng nhập
  }

  const customerId = req.session.idKhachHang; // Lấy ID khách hàng đã đăng nhập từ phiên làm việc
  const productId = req.body.productId; // Lấy ID sản phẩm từ yêu cầu

  if (!productId) {
    return res.status(400).send('Missing product ID');
  }

  const query = `
    DELETE FROM YEUTHICH
    WHERE ID_KH = ? AND ID_SP = ?
  `;

  db.query(query, [customerId, productId], (err, results) => {
    if (err) {
      console.error('Lỗi khi xóa sản phẩm yêu thích:', err);
      return res.status(500).send('Đã xảy ra lỗi khi xóa sản phẩm yêu thích.');
    }

    // Sau khi xóa, chuyển hướng lại trang danh sách yêu thích
    res.redirect('/khachhang/kh_yeuthich');
  });
});
app.get('/khachhang/kh_danhgia', (req, res) => {
  const sort = req.query.sort;
  let orderClause = 'ORDER BY danhgia.NGAY_DG DESC';

  if (sort === 'low_to_high') {
    orderClause = 'ORDER BY danhgia.HANG_DG ASC';
  }

  const queryDanhgia = `
    SELECT danhgia.*, sanpham.TEN_SP, khachhang.TEN_KH, sanpham.ANH_SP
    FROM danhgia 
    JOIN sanpham ON danhgia.ID_SP = sanpham.ID_SP 
    JOIN khachhang ON danhgia.ID_KH = khachhang.ID_KH 
    ${orderClause}
  `;

  const queryTopRatedProducts = `
    SELECT sanpham.TEN_SP, COUNT(danhgia.ID_DG) AS SO_LUONG_DANH_GIA, sanpham.ANH_SP
    FROM danhgia
    JOIN sanpham ON danhgia.ID_SP = sanpham.ID_SP
    GROUP BY danhgia.ID_SP, sanpham.TEN_SP, sanpham.ANH_SP
    ORDER BY SO_LUONG_DANH_GIA DESC
    LIMIT 3;
  `;

  db.query(queryDanhgia, (err, reviews) => {
    if (err) {
      console.error('Lỗi khi lấy dữ liệu đánh giá:', err);
      return res.status(500).send('Đã xảy ra lỗi khi tải dữ liệu đánh giá.');
    }

    db.query(queryTopRatedProducts, (err, topRatedProducts) => {
      if (err) {
        console.error('Lỗi khi lấy dữ liệu sản phẩm được đánh giá nhiều nhất:', err);
        return res.status(500).send('Đã xảy ra lỗi khi tải dữ liệu sản phẩm được đánh giá nhiều nhất.');
      }

      res.render('khachhang/kh_danhgia', { reviews: reviews, topRatedProducts: topRatedProducts });
    });
  });
});
app.post('/khachhang/dathang_chuyenkhoan', (req, res) => {
  const ID_KH = req.session.idKhachHang;

  // Lấy tất cả các ghi chú từ req.body
  const ghiChuKeys = Object.keys(req.body).filter(key => key.startsWith('ghichu_'));
  const ghiChuMap = {};
  ghiChuKeys.forEach(key => {
    const idGioHang = key.split('_')[1];
    ghiChuMap[idGioHang] = req.body[key];
  });

  const selectGioHangQuery = `
    SELECT gh.ID_GH, gh.SOLUONG, gh.ID_SP, gh.GIA_UOCTINH, gh.ID_KICH_THUOC
    FROM giohang gh
    JOIN sanpham sp ON gh.ID_SP = sp.ID_SP
    WHERE gh.ID_KH = ?
  `;

  db.query(selectGioHangQuery, [ID_KH], (selectErr, gioHang) => {
    if (selectErr) {
      console.error('Lỗi khi lấy giỏ hàng:', selectErr);
      return res.status(500).send('Đã xảy ra lỗi khi đặt hàng.');
    }

    let tongHoaDon = 0;
    gioHang.forEach(item => {
      tongHoaDon += item.SOLUONG * item.GIA_UOCTINH;
    });

    const insertHoaDonQuery = `
      INSERT INTO hoadon (NGAYLAP_HD, ID_KH, TONG_HD, LOAI_TT, TRANGTHAI) 
      VALUES (NOW(), ?, ?, 'Chuyển khoản', 'Chờ xác nhận')
    `;

    db.query(insertHoaDonQuery, [ID_KH, tongHoaDon], (insertErr, result) => {
      if (insertErr) {
        console.error('Lỗi khi tạo hóa đơn:', insertErr);
        return res.status(500).send('Đã xảy ra lỗi khi đặt hàng.');
      }

      const ID_HD = result.insertId;

      const insertChiTietHoaDonQuery = `
        INSERT INTO chitiethoadon (SOLUONG, ID_HD, ID_SP, GIA_SP_HT, ID_KICH_THUOC, GHICHU) 
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      const chiTietHoaDonPromises = gioHang.map(item => {
        const ghichu = ghiChuMap[item.ID_GH] || ''; // Lấy ghi chú tương ứng cho từng item
        return new Promise((resolve, reject) => {
          db.query(insertChiTietHoaDonQuery, [item.SOLUONG, ID_HD, item.ID_SP, item.GIA_UOCTINH, item.ID_KICH_THUOC, ghichu], (insertDetailErr) => {
            if (insertDetailErr) {
              reject(insertDetailErr);
            } else {
              resolve();
            }
          });
        });
      });

      Promise.all(chiTietHoaDonPromises)
        .then(() => {
          const deleteGioHangQuery = 'DELETE FROM giohang WHERE ID_KH = ?';
          db.query(deleteGioHangQuery, [ID_KH], (deleteErr) => {
            if (deleteErr) {
              console.error('Lỗi khi xóa giỏ hàng:', deleteErr);
              return res.status(500).send('Đã xảy ra lỗi khi đặt hàng.');
            }

            // Lưu thông báo thành công vào session
            req.session.successMessage = 'Đặt hàng chuyển khoản thành công!';
            res.redirect('/khachhang/kh_sanpham');
          });
        })
        .catch(err => {
          console.error('Lỗi khi thêm chi tiết hóa đơn:', err);
          return res.status(500).send('Đã xảy ra lỗi khi đặt hàng.');
        });
    });
  });
});
app.post('/khachhang/dathang_tructiep', (req, res) => {
  const ID_KH = req.session.idKhachHang;

  // Lấy tất cả các ghi chú từ req.body
  const ghiChuKeys = Object.keys(req.body).filter(key => key.startsWith('ghichu_'));
  const ghiChuMap = {};
  ghiChuKeys.forEach(key => {
    const idGioHang = key.split('_')[1];
    ghiChuMap[idGioHang] = req.body[key];
  });

  const selectGioHangQuery = `
    SELECT gh.ID_GH, gh.SOLUONG, gh.ID_SP, gh.GIA_UOCTINH, gh.ID_KICH_THUOC
    FROM giohang gh
    JOIN sanpham sp ON gh.ID_SP = sp.ID_SP
    WHERE gh.ID_KH = ?
  `;

  db.query(selectGioHangQuery, [ID_KH], (selectErr, gioHang) => {
    if (selectErr) {
      console.error('Lỗi khi lấy giỏ hàng:', selectErr);
      return res.status(500).send('Đã xảy ra lỗi khi đặt hàng.');
    }

    let tongHoaDon = 0;
    gioHang.forEach(item => {
      tongHoaDon += item.SOLUONG * item.GIA_UOCTINH;
    });

    const insertHoaDonQuery = `
      INSERT INTO hoadon (NGAYLAP_HD, ID_KH, TONG_HD, LOAI_TT, TRANGTHAI) 
      VALUES (NOW(), ?, ?, 'Đặt trước', 'Chờ xác nhận')
    `;

    db.query(insertHoaDonQuery, [ID_KH, tongHoaDon], (insertErr, result) => {
      if (insertErr) {
        console.error('Lỗi khi tạo hóa đơn:', insertErr);
        return res.status(500).send('Đã xảy ra lỗi khi đặt hàng.');
      }

      const ID_HD = result.insertId;

      const insertChiTietHoaDonQuery = `
        INSERT INTO chitiethoadon (SOLUONG, ID_HD, ID_SP, GIA_SP_HT, ID_KICH_THUOC, GHICHU) 
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      const chiTietHoaDonPromises = gioHang.map(item => {
        const ghichu = ghiChuMap[item.ID_GH] || ''; // Lấy ghi chú tương ứng cho từng item
        return new Promise((resolve, reject) => {
          db.query(insertChiTietHoaDonQuery, [item.SOLUONG, ID_HD, item.ID_SP, item.GIA_UOCTINH, item.ID_KICH_THUOC, ghichu], (insertDetailErr) => {
            if (insertDetailErr) {
              reject(insertDetailErr);
            } else {
              resolve();
            }
          });
        });
      });

      Promise.all(chiTietHoaDonPromises)
        .then(() => {
          const deleteGioHangQuery = 'DELETE FROM giohang WHERE ID_KH = ?';
          db.query(deleteGioHangQuery, [ID_KH], (deleteErr) => {
            if (deleteErr) {
              console.error('Lỗi khi xóa giỏ hàng:', deleteErr);
              return res.status(500).send('Đã xảy ra lỗi khi đặt hàng.');
            }

            // Lưu thông báo thành công vào session
            req.session.successMessage = 'Đặt hàng trực tiếp thành công!';
            res.redirect('/khachhang/kh_sanpham');
          });
        })
        .catch(err => {
          console.error('Lỗi khi thêm chi tiết hóa đơn:', err);
          return res.status(500).send('Đã xảy ra lỗi khi đặt hàng.');
        });
    });
  });
});

// Route để hiển thị danh sách hóa đơn chờ xác nhận
  app.get('/nhanvien/xacnhandon', (req, res) => {
    const query = `
      SELECT 
          hd.ID_HD, 
          hd.NGAYLAP_HD, 
          hd.ID_KH, 
          hd.TRANGTHAI,
          sp.TEN_SP,
          sp.ID_DM,
          chi.SOLUONG,
          chi.GHICHU,
          kt.TEN_KICH_THUOC,
          (SELECT SUM(cthd.SOLUONG * cthd.GIA_SP_HT)
          FROM chitiethoadon cthd
          JOIN sanpham sp2 ON cthd.ID_SP = sp2.ID_SP
          WHERE cthd.ID_HD = hd.ID_HD) AS TONG_HD,
          hd.LOAI_TT,         -- Lấy thông tin loại thanh toán từ bảng hoadon
          hd.TRANGTHAI AS TRANGTHAI_TT  -- Sử dụng trường TRANGTHAI từ bảng hoadon làm trạng thái thanh toán
      FROM hoadon hd
      JOIN chitiethoadon chi ON hd.ID_HD = chi.ID_HD
      JOIN sanpham sp ON chi.ID_SP = sp.ID_SP
      JOIN kichthuoc kt ON chi.ID_KICH_THUOC = kt.ID_KICH_THUOC
      WHERE hd.TRANGTHAI = 'Chờ xác nhận'
      ORDER BY hd.ID_HD, chi.ID_SP;
    `;

    db.query(query, (err, results) => {
      if (err) {
        console.error('Lỗi khi lấy danh sách hóa đơn chờ xác nhận:', err);
        return res.status(500).send('Đã xảy ra lỗi khi tải danh sách hóa đơn.');
      }

      // Xử lý dữ liệu
      const hoadonsMap = new Map();
      results.forEach(row => {
        if (!hoadonsMap.has(row.ID_HD)) {
          hoadonsMap.set(row.ID_HD, {
            ID_HD: row.ID_HD,
            NGAYLAP_HD: row.NGAYLAP_HD,
            ID_KH: row.ID_KH,
            TRANGTHAI: row.TRANGTHAI,
            TONG_HD: row.TONG_HD,
            LOAI_TT: row.LOAI_TT,  // Lưu loại thanh toán
            TRANGTHAI_TT: row.TRANGTHAI_TT,  // Lưu trạng thái thanh toán
            products: []
          });
        }
        hoadonsMap.get(row.ID_HD).products.push({
          TEN_SP: row.TEN_SP,
          SOLUONG: row.SOLUONG,
          TEN_KICH_THUOC: row.TEN_KICH_THUOC,
          GHICHU: row.GHICHU 
        });
      });

      const hoadons = Array.from(hoadonsMap.values());

      // Render view
      res.render('nhanvien/xacnhandon', { hoadons });
    });
  });
// Thêm route để tự động từ chối đơn hàng
app.post('/nhanvien/tu_choi_don_auto/:id', async (req, res) => {
  try {
    const idHoaDon = req.params.id;
    
    // Kiểm tra loại thanh toán của hóa đơn
    const checkQuery = 'SELECT LOAI_TT FROM hoadon WHERE ID_HD = ?';
    db.query(checkQuery, [idHoaDon], (checkErr, checkResult) => {
      if (checkErr) {
        console.error('Lỗi kiểm tra hóa đơn:', checkErr);
        return res.json({ success: false, message: 'Lỗi kiểm tra hóa đơn' });
      }

      // Nếu là đơn chuyển khoản thì bỏ qua
      if (checkResult[0]?.LOAI_TT === 'Chuyển khoản') {
        return res.json({ success: false, message: 'Đơn hàng chuyển khoản không bị từ chối tự động' });
      }

      // Cập nhật trạng thái hóa đơn thành "Đã hủy"
      const updateQuery = `
        UPDATE hoadon 
        SET TRANGTHAI_TT = 'Đã hủy',
            LYDO_HUY = 'Tự động hủy sau 5 phút không xác nhận'
        WHERE ID_HD = ?`;

      db.query(updateQuery, [idHoaDon], (updateErr, updateResult) => {
        if (updateErr) {
          console.error('Lỗi cập nhật hóa đơn:', updateErr);
          return res.json({ success: false, message: 'Lỗi cập nhật hóa đơn' });
        }

        res.json({ success: true, message: 'Đã tự động từ chối đơn hàng' });
      });
    });
  } catch (error) {
    console.error('Lỗi:', error);
    res.json({ success: false, message: 'Đã xảy ra lỗi' });
  }
});
// Route để cập nhật trạng thái đơn hàng
app.post('/nhanvien/xacnhandon/:id', (req, res) => {
  const idHoaDon = req.params.id;
  const idNhanVien = req.session.idNhanVien; // Lấy ID_NV từ session của nhân viên

  // Cập nhật trạng thái hóa đơn thành "Đã xác nhận" và gán ID nhân viên
  const updateHoaDonQuery = `
    UPDATE hoadon
    SET TRANGTHAI = 'Đã xác nhận', ID_NV = ?
    WHERE ID_HD = ?
  `;
  db.query(updateHoaDonQuery, [idNhanVien, idHoaDon], (err, result) => {
    if (err) {
      console.error('Lỗi khi cập nhật trạng thái hóa đơn:', err);
      return res.status(500).send('Đã xảy ra lỗi khi cập nhật trạng thái hóa đơn.');
    }

    // Lấy thông tin chi tiết hóa đơn
    const selectChiTietHoaDonQuery = `
      SELECT ID_SP, SOLUONG, ID_KICH_THUOC
      FROM chitiethoadon
      WHERE ID_HD = ?
    `;
    db.query(selectChiTietHoaDonQuery, [idHoaDon], (err, chiTietResults) => {
      if (err) {
        console.error('Lỗi khi lấy chi tiết hóa đơn:', err);
        return res.status(500).send('Đã xảy ra lỗi khi lấy chi tiết hóa đơn.');
      }

      // Tạo danh sách promises để cập nhật số lượt mua cho từng sản phẩm
      const updateLuotMuaPromises = chiTietResults.map(row => {
        const updateLuotMuaQuery = `
          UPDATE sanpham
          SET LUOT_MUA = LUOT_MUA + ?
          WHERE ID_SP = ?
        `;
        return new Promise((resolve, reject) => {
          db.query(updateLuotMuaQuery, [row.SOLUONG, row.ID_SP], (err, result) => {
            if (err) {
              console.error('Lỗi khi cập nhật LUOT_MUA cho sản phẩm', row.ID_SP, ':', err);
              reject(err);
            } else {
              resolve(result);
            }
          });
        });
      });

      // Cập nhật số lượng nguyên liệu dựa trên công thức sản phẩm và kích thước
      const nguyenLieuUpdates = [];
      const chiTietHoaDonPromises = chiTietResults.map(item => {
        return new Promise((resolve, reject) => {
          const queryCongThuc = `
            SELECT ID_NL, DUNG_TICH_NL_CAN
            FROM congthuc
            WHERE ID_SP = ? AND ID_KICH_THUOC = ?
          `;
          db.query(queryCongThuc, [item.ID_SP, item.ID_KICH_THUOC], (err, congthucResults) => {
            if (err) {
              reject(err);
            } else {
              congthucResults.forEach(ct => {
                const totalDungTichCan = ct.DUNG_TICH_NL_CAN * item.SOLUONG;
                nguyenLieuUpdates.push(
                  new Promise((resolve, reject) => {
                    db.query('UPDATE nguyenlieu SET DUNG_TICH_NL = DUNG_TICH_NL - ? WHERE ID_NL = ?',
                      [totalDungTichCan, ct.ID_NL],
                      (err, result) => {
                        if (err) {
                          reject(err);
                        } else {
                          resolve(result);
                        }
                      });
                  })
                );
              });
              resolve();
            }
          });
        });
      });

      // Xử lý tất cả các promises
      Promise.all(updateLuotMuaPromises)
        .then(() => Promise.all(chiTietHoaDonPromises))
        .then(() => Promise.all(nguyenLieuUpdates))
        .then(() => {
          res.send('<script>alert("Đơn hàng đã được xác nhận và thanh toán!"); window.location.href = "/nhanvien/xacnhandon";</script>');
        })
        .catch(err => {
          console.error('Lỗi khi cập nhật LUOT_MUA hoặc nguyên liệu:', err);
          res.status(500).send('Đã xảy ra lỗi khi cập nhật số lượt mua của sản phẩm hoặc nguyên liệu.');
        });
    });
  });
});



// điếm số lượng đơn hàng
app.get('/nhanvien/donhangmoi', (req, res) => {
  const queryCountHoaDon = `
    SELECT COUNT(*) AS count FROM hoadon WHERE TRANGTHAI = 'Chờ xác nhận'
  `;
  db.query(queryCountHoaDon, (err, result) => {
    if (err) {
      console.error('Lỗi khi đếm số lượng đơn hàng mới:', err);
      return res.status(500).send('Đã xảy ra lỗi khi đếm số lượng đơn hàng mới.');
    }
    const count = result[0].count;
    res.json({ count });
  });
});
// Route xử lý yêu cầu hủy đơn
app.post('/nhanvien/huydon/:id', (req, res) => {
  const { id } = req.params;
  const { reason, hoadon_id } = req.body;
  const nvId = req.session.idNhanVien; // Lấy ID của nhân viên từ session đã được thiết lập trước đó

  // Bước 1: Thêm lý do hủy đơn vào cột MOTA của bảng hoadon
  const updateHoaDonQuery = 'UPDATE hoadon SET TRANGTHAI = ?, ID_NV = ?, MOTA = ? WHERE ID_HD = ?';
  db.query(updateHoaDonQuery, ['Đã hủy', nvId, reason, hoadon_id], (err, result) => {
    if (err) {
      console.error('Lỗi khi cập nhật trạng thái hóa đơn:', err);
      return res.status(500).send('Hủy đơn hàng không thành công. Vui lòng thử lại sau.');
    }

    // Bước 2: Lấy chi tiết hóa đơn để hoàn trả lại số lượng nguyên liệu
    const selectChiTietHoaDonQuery = `
      SELECT ID_SP, SOLUONG, ID_KICH_THUOC
      FROM chitiethoadon
      WHERE ID_HD = ?
    `;
    db.query(selectChiTietHoaDonQuery, [hoadon_id], (err, chiTietResults) => {
      if (err) {
        console.error('Lỗi khi lấy chi tiết hóa đơn:', err);
        return res.status(500).send('Hủy đơn hàng không thành công. Vui lòng thử lại sau.');
      }

      const nguyenLieuUpdates = [];
      const chiTietHoaDonPromises = chiTietResults.map(item => {
        return new Promise((resolve, reject) => {
          const queryCongThuc = `
            SELECT ID_NL, DUNG_TICH_NL_CAN
            FROM congthuc
            WHERE ID_SP = ? AND ID_KICH_THUOC = ?
          `;
          db.query(queryCongThuc, [item.ID_SP, item.ID_KICH_THUOC], (err, congthucResults) => {
            if (err) {
              reject(err);
            } else {
              congthucResults.forEach(ct => {
                const totalDungTichCan = ct.DUNG_TICH_NL_CAN * item.SOLUONG;
                nguyenLieuUpdates.push(
                  new Promise((resolve, reject) => {
                    db.query('UPDATE nguyenlieu SET DUNG_TICH_NL = DUNG_TICH_NL + ? WHERE ID_NL = ?',
                      [totalDungTichCan, ct.ID_NL],
                      (err, result) => {
                        if (err) {
                          reject(err);
                        } else {
                          resolve(result);
                        }
                      });
                  })
                );
              });
              resolve();
            }
          });
        });
      });

      // Bước 3: Thực hiện cập nhật số lượng nguyên liệu
      Promise.all(chiTietHoaDonPromises)
        .then(() => Promise.all(nguyenLieuUpdates))
        .then(() => {
          res.send('<script>alert("Đơn hàng đã được hủy thành công!"); window.location.href = "/nhanvien/xacnhandon";</script>');
        })
        .catch(err => {
          console.error('Lỗi khi cập nhật nguyên liệu sau khi hủy đơn:', err);
          res.status(500).send('Đã xảy ra lỗi khi cập nhật nguyên liệu sau khi hủy đơn hàng.');
        });
    });
  });
});


app.get('/nhanvien/lichsu_oder', (req, res) => {
  if (!req.session.idNhanVien) {
    return res.redirect('/'); // Chuyển hướng về trang đăng nhập nếu chưa đăng nhập
  }

  const employeeId = req.session.idNhanVien; // Lấy ID nhân viên từ phiên làm việc
  const selectedMonth = req.query.month; // Lấy tháng được chọn từ query parameters
  const selectedYear = req.query.year;   // Lấy năm được chọn từ query parameters

  // Truy vấn SQL để tìm hóa đơn theo tháng và năm
  const sqlQuery = `
    SELECT 
      hd.ID_HD,
      hd.NGAYLAP_HD,
      hd.TONG_HD,
      hd.TRANGTHAI,
      hd.LOAI_TT,
      hd.MOTA,  -- Lấy thông tin MOTA từ bảng hoadon
      GROUP_CONCAT(
        CONCAT(
          'Tên: ', sp.TEN_SP, 
          ', Số Lượng: ', cthd.SOLUONG, 
          ', Giá: ', FORMAT(cthd.GIA_SP_HT, 0), 
          ', Kích thước: ', cthd.ID_KICH_THUOC
        ) ORDER BY sp.TEN_SP ASC SEPARATOR ', '
      ) AS DANH_SACH_SAN_PHAM
    FROM 
      hoadon hd
    JOIN 
      chitiethoadon cthd ON hd.ID_HD = cthd.ID_HD
    JOIN 
      sanpham sp ON cthd.ID_SP = sp.ID_SP
    WHERE 
      hd.ID_NV = ? 
      AND MONTH(hd.NGAYLAP_HD) = ? 
      AND YEAR(hd.NGAYLAP_HD) = ?
    GROUP BY 
      hd.ID_HD
    ORDER BY 
      hd.NGAYLAP_HD DESC;
  `;

  db.query(sqlQuery, [employeeId, selectedMonth, selectedYear], (err, results) => {
    if (err) {
      console.error('Lỗi khi lấy dữ liệu lịch sử đơn hàng:', err);
      return res.status(500).send('Đã xảy ra lỗi khi tải dữ liệu lịch sử đơn hàng.');
    }

    // Render view và truyền dữ liệu lịch sử đơn hàng
    res.render('nhanvien/lichsu_oder', {
      orders: results,
      selectedMonth: selectedMonth,  // Truyền tháng được chọn vào view
      selectedYear: selectedYear      // Truyền năm được chọn vào view
    });
  });
});

// Route để thêm sản phẩm vào danh sách yêu thích
app.post('/khachhang/kh_yeuthich', (req, res) => {
  const idSanPham = req.body.sp_id;
  const idKhachHang = req.session.idKhachHang;

  const query = `
    INSERT INTO YEUTHICH (ID_SP, ID_KH) VALUES (?, ?)
  `;

  db.query(query, [idSanPham, idKhachHang], (err, result) => {
    if (err) {
      console.error('Lỗi khi thêm vào yêu thích:', err);
      return res.status(500).send('Đã xảy ra lỗi khi thêm vào yêu thích.');
    }

    res.send('<script>alert("Sản phẩm đã được thêm vào danh sách yêu thích!"); window.location.href = "/khachhang/kh_sanpham";</script>');
  });
});
app.post('/khachhang/kh_yeuthich--dx', (req, res) => {
  const idSanPham = req.body.sp_id;
  const idKhachHang = req.session.idKhachHang;

  const query = `
    INSERT INTO YEUTHICH (ID_SP, ID_KH) VALUES (?, ?)
  `;

  db.query(query, [idSanPham, idKhachHang], (err, result) => {
    if (err) {
      console.error('Lỗi khi thêm vào yêu thích:', err);
      return res.status(500).send('Đã xảy ra lỗi khi thêm vào yêu thích.');
    }

    res.send('<script>alert("Sản phẩm đã được thêm vào danh sách yêu thích!"); window.location.href = "/khachhang/kh_yeuthich";</script>');
  });
});
// Route để thêm đánh giá cho sản phẩm
app.post('/khachhang/kh_danhgia', (req, res) => {
  const idSanPham = req.body.sp_id;
  const idKhachHang = req.session.idKhachHang;
  const hangDanhGia = req.body.rate; // Lấy giá trị đánh giá sao
  const binhLuanDanhGia = req.body.binhluan_dg;
  const ngayDanhGia = new Date().toISOString().slice(0, 10); // Lấy ngày hiện tại ở định dạng yyyy-mm-dd

  const query = `
    INSERT INTO DANHGIA (ID_SP, ID_KH, HANG_DG, BINHLUAN_DG, NGAY_DG)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(query, [idSanPham, idKhachHang, hangDanhGia, binhLuanDanhGia, ngayDanhGia], (err, result) => {
    if (err) {
      console.error('Lỗi khi thêm đánh giá sản phẩm:', err);
      return res.status(500).send('Đã xảy ra lỗi khi thêm đánh giá sản phẩm.');
    }

    res.send('<script>alert("Đánh giá của bạn đã được gửi!"); window.location.href = "/khachhang/kh_sanpham";</script>');
  });
});

// Route để hiển thị hồ sơ khách hàng
app.get('/khachhang/kh_xemhoso', (req, res) => {
  const idKhachHang = req.session.idKhachHang;
  const message = req.query.message; // Nhận thông báo từ query string

  const queryHoSo = `
    SELECT * FROM KHACHHANG WHERE ID_KH = ?
  `;

  const queryTongSanPhamDaMua = `
    SELECT khachhang.ID_KH, khachhang.TEN_KH, SUM(chitiethoadon.SOLUONG) AS TONG_SAN_PHAM_DA_MUA
    FROM khachhang
    JOIN hoadon ON khachhang.ID_KH = hoadon.ID_KH
    JOIN chitiethoadon ON hoadon.ID_HD = chitiethoadon.ID_HD
    WHERE khachhang.ID_KH = ?
    GROUP BY khachhang.ID_KH, khachhang.TEN_KH
  `;

  const queryTongSanPhamYeuThich = `
    SELECT khachhang.ID_KH, khachhang.TEN_KH, COUNT(yeuthich.ID_SP) AS TONG_SAN_PHAM_YEU_THICH
    FROM yeuthich
    JOIN khachhang ON yeuthich.ID_KH = khachhang.ID_KH
    WHERE khachhang.ID_KH = ?
    GROUP BY khachhang.ID_KH, khachhang.TEN_KH
  `;

  const queryTongSanPhamDaDanhGia = `
    SELECT khachhang.ID_KH, khachhang.TEN_KH, COUNT(danhgia.ID_SP) AS TONG_SAN_PHAM_DA_DANH_GIA
    FROM danhgia
    JOIN khachhang ON danhgia.ID_KH = khachhang.ID_KH
    WHERE khachhang.ID_KH = ?
    GROUP BY khachhang.ID_KH, khachhang.TEN_KH
  `;

  const queryTongSoTienDaMua = `
    SELECT khachhang.ID_KH, khachhang.TEN_KH, SUM(chitiethoadon.GIA_SP_HT * chitiethoadon.SOLUONG) AS TONG_SO_TIEN_DA_MUA
    FROM khachhang
    JOIN hoadon ON khachhang.ID_KH = hoadon.ID_KH
    JOIN chitiethoadon ON hoadon.ID_HD = chitiethoadon.ID_HD
    WHERE khachhang.ID_KH = ?
    GROUP BY khachhang.ID_KH, khachhang.TEN_KH
  `;

  Promise.all([
    new Promise((resolve, reject) => {
      db.query(queryHoSo, [idKhachHang], (err, results) => {
        if (err) return reject(err);
        resolve(results[0]);
      });
    }),
    new Promise((resolve, reject) => {
      db.query(queryTongSanPhamDaMua, [idKhachHang], (err, results) => {
        if (err) return reject(err);
        resolve(results[0]);
      });
    }),
    new Promise((resolve, reject) => {
      db.query(queryTongSanPhamYeuThich, [idKhachHang], (err, results) => {
        if (err) return reject(err);
        resolve(results[0]);
      });
    }),
    new Promise((resolve, reject) => {
      db.query(queryTongSanPhamDaDanhGia, [idKhachHang], (err, results) => {
        if (err) return reject(err);
        resolve(results[0]);
      });
    }),
    new Promise((resolve, reject) => {
      db.query(queryTongSoTienDaMua, [idKhachHang], (err, results) => {
        if (err) return reject(err);
        resolve(results[0]);
      });
    })
  ])
    .then(([hoSoKhachHang, tongSanPhamDaMua, tongSanPhamYeuThich, tongSanPhamDaDanhGia, tongSoTienDaMua]) => {
      res.render('khachhang/kh_xemhoso', {
        hoSoKhachHang,
        tongSanPhamDaMua: tongSanPhamDaMua?.TONG_SAN_PHAM_DA_MUA || 0,
        tongSanPhamYeuThich: tongSanPhamYeuThich?.TONG_SAN_PHAM_YEU_THICH || 0,
        tongSanPhamDaDanhGia: tongSanPhamDaDanhGia?.TONG_SAN_PHAM_DA_DANH_GIA || 0,
        tongSoTienDaMua: tongSoTienDaMua?.TONG_SO_TIEN_DA_MUA || 0,
        formatCurrency: (value) => {
          return value.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
        },
        message // Truyền thông báo vào template
      });
    })
    .catch(err => {
      console.error('Lỗi khi lấy thông tin hồ sơ khách hàng:', err);
      res.status(500).send('Đã xảy ra lỗi khi lấy thông tin hồ sơ.');
    });
});

// Route để cập nhật hồ sơ khách hàng
app.post('/khachhang/kh_xemhoso', upload.single('anh_kh'), (req, res) => {
  const idKhachHang = req.session.idKhachHang;
  const { ten_kh, email_kh, sdt_kh, diachi_kh } = req.body;
  let anh_kh = req.file ? `/uploads/${req.file.filename}` : null;

  let query = `
    UPDATE KHACHHANG SET TEN_KH = ?, GMAIL_KH = ?, SDT_KH = ?, DIACHI_KH = ?
  `;
  let params = [ten_kh, email_kh, sdt_kh, diachi_kh];

  if (anh_kh) {
    query += ', ANH = ?';
    params.push(anh_kh);
  }

  query += ' WHERE ID_KH = ?';
  params.push(idKhachHang);

  db.query(query, params, (err, result) => {
    if (err) {
      console.error('Lỗi khi cập nhật hồ sơ:', err);
      return res.status(500).send('Đã xảy ra lỗi khi cập nhật hồ sơ.');
    }

    req.flash('messages', 'Cập nhật hồ sơ thành công!');
    res.redirect('/khachhang/kh_xemhoso');
  });
});



app.get('/khachhang/kh_xemdondadat', (req, res) => {
  const idKhachHang = req.session.idKhachHang; // Lấy ID khách hàng từ session
  const trangThai = req.query.trangThai || ''; // Lấy trạng thái từ query

  // Kiểm tra nếu phiên đăng nhập đã được thiết lập
  if (!idKhachHang) {
    return res.redirect('/login'); // Chuyển hướng đến trang đăng nhập nếu không có ID khách hàng
  }

  // Câu lệnh SQL để lấy danh sách đơn hàng theo trạng thái từ query
  let queryOrders = `
    SELECT 
      hd.ID_HD,
      hd.NGAYLAP_HD,
      hd.TONG_HD,
      hd.TRANGTHAI,
      GROUP_CONCAT(
        CONCAT(
          'Tên: ', sp.TEN_SP, 
          ', Số Lượng: ', cthd.SOLUONG, 
          ', Giá: ', FORMAT(cthd.GIA_SP_HT, 0), 
          ', Kích thước: ', cthd.ID_KICH_THUOC
        ) ORDER BY sp.TEN_SP ASC SEPARATOR ', '
      ) AS DANH_SACH_SAN_PHAM
    FROM 
      hoadon hd
    JOIN 
      chitiethoadon cthd ON hd.ID_HD = cthd.ID_HD
    JOIN 
      sanpham sp ON cthd.ID_SP = sp.ID_SP
    WHERE 
      hd.ID_KH = ?
  `;

  // Thêm điều kiện trạng thái nếu có
  if (trangThai) {
    queryOrders += ` AND hd.TRANGTHAI = ?`;
  }

  queryOrders += ` GROUP BY 
      hd.ID_HD, hd.NGAYLAP_HD, hd.TONG_HD, hd.TRANGTHAI;`;

  // Câu lệnh SQL để lấy danh sách đơn hàng với trạng thái 'Chờ xác nhận'
  const queryPendingOrders = `
    SELECT 
      hd.ID_HD,
      hd.NGAYLAP_HD,
      hd.TONG_HD,
      hd.TRANGTHAI,
      GROUP_CONCAT(
        CONCAT(
          'Tên: ', sp.TEN_SP, 
          ', Số Lượng: ', cthd.SOLUONG, 
          ', Giá: ', FORMAT(cthd.GIA_SP_HT, 0), 
          ', Kích thước: ', cthd.ID_KICH_THUOC
        ) ORDER BY sp.TEN_SP ASC SEPARATOR ', '
      ) AS DANH_SACH_SAN_PHAM
    FROM 
      hoadon hd
    JOIN 
      chitiethoadon cthd ON hd.ID_HD = cthd.ID_HD
    JOIN 
      sanpham sp ON cthd.ID_SP = sp.ID_SP
    WHERE 
      hd.ID_KH = ? AND hd.TRANGTHAI = 'Chờ xác nhận'
    GROUP BY 
      hd.ID_HD, hd.NGAYLAP_HD, hd.TONG_HD, hd.TRANGTHAI;
  `;

  // Thực thi các câu lệnh SQL
  db.query(queryOrders, trangThai ? [idKhachHang, trangThai] : [idKhachHang], (err, ordersResults) => {
    if (err) {
      console.error('Lỗi khi lấy dữ liệu hóa đơn:', err);
      return res.status(500).send('Đã xảy ra lỗi khi tải dữ liệu hóa đơn.');
    }

    db.query(queryPendingOrders, [idKhachHang], (err, pendingResults) => {
      if (err) {
        console.error('Lỗi khi lấy dữ liệu hóa đơn chờ xác nhận:', err);
        return res.status(500).send('Đã xảy ra lỗi khi tải dữ liệu hóa đơn chờ xác nhận.');
      }

      // Render dữ liệu vào template EJS
      res.render('khachhang/kh_xemdondadat', {
        orders: ordersResults,
        pendingOrders: pendingResults,
        trangThai: trangThai
      });
    });
  });
});

app.get('/quanly/thongbao', (req, res) => {
  const nguyenlieuQuery = 'SELECT * FROM nguyenlieu WHERE DUNG_TICH_NL <= 400';
  
  const yeucauthaycaQuery = `
  SELECT 
      yctc.*, 
      nv_request.HOTEN_NV AS NV_REQUEST_NAME, 
      nv_replace.HOTEN_NV AS NV_REPLACE_NAME 
  FROM 
      yeucauthayca yctc
  LEFT JOIN 
      nhanvien nv_request ON yctc.NHANVIEN_YEUCAU = nv_request.ID_NV
  LEFT JOIN 
      nhanvien nv_replace ON yctc.NHANVIEN_THAYCA = nv_replace.ID_NV
  WHERE 
      yctc.XACNHAN_QL = 0;
  `;

  const xinnghiphepQuery = `
  SELECT
      xnp.ID_XNP, 
      xnp.XACNHAN_QL, 
      xnp.MOTA, 
      xnp.CALAMMUONNGHI , 
      xnp.NGAY_L, 
      nv.HOTEN_NV 
  FROM 
      xinnghiphep xnp
  JOIN 
      nhanvien nv ON xnp.ID_NV = nv.ID_NV;
  `;

  db.query(nguyenlieuQuery, (err, nguyenlieuResults) => {
    if (err) {
      console.error('Lỗi khi lấy dữ liệu nguyên liệu:', err);
      return res.status(500).send('Đã xảy ra lỗi khi lấy dữ liệu nguyên liệu.');
    }

    db.query(yeucauthaycaQuery, (err, yeucauthaycaResults) => {
      if (err) {
        console.error('Lỗi khi lấy dữ liệu YEUCAUTHAYCA:', err);
        return res.status(500).send('Đã xảy ra lỗi khi lấy dữ liệu YEUCAUTHAYCA.');
      }

      // Thêm truy vấn cho xinnghiphep
      db.query(xinnghiphepQuery, (err, xinnghiphepResults) => {
        if (err) {
          console.error('Lỗi khi lấy dữ liệu XINNGHIPHEP:', err);
          return res.status(500).send('Đã xảy ra lỗi khi lấy dữ liệu XINNGHIPHEP.');
        }

        // Render và truyền cả 3 kết quả vào view
        res.render('quanly/thongbao', {
          nguyenlieu: nguyenlieuResults,
          yeucauthayca: yeucauthaycaResults,
          xinnghiphep: xinnghiphepResults
        });
      });
    });
  });
});
// Route để xử lý xác nhận thao tác
app.post('/quanly/yeucaudoica/xacnhan', (req, res) => {
  const { id } = req.body;
  // Lấy thông tin thao tác từ database
  db.query('SELECT * FROM YEUCAUTHAYCA WHERE ID_YCTC = ?', [id], (err, results) => {
    if (err) throw err;
    const THAYCA = results[0];
    // Cập nhật lịch làm
    db.query(`
          UPDATE lichlam
          SET ${THAYCA.CALAMMUONTHAY} = ?
          WHERE ID_LL = ? AND NGAY_L = ?`,
      [THAYCA.NHANVIEN_THAYCA, THAYCA.ID_LL, THAYCA.NGAY_L],
      (err, results) => {
        if (err) throw err;

        // Cập nhật trạng thái thao tác
        db.query(`
                  UPDATE YEUCAUTHAYCA
                  SET XACNHAN_QL = 1
                  WHERE ID_YCTC = ?`,
          [id],
          (err, results) => {
            if (err) throw err;
            res.redirect('/quanly/thongbao'); // Điều hướng về trang thông báo quản lý
          }
        );
      }
    );
  });
});
// Route để xử lý hủy thao tác
app.post('/quanly/yeucaudoica/huy', (req, res) => {
  const id = req.body.id;
  const updateQuery = 'UPDATE YEUCAUTHAYCA SET XACNHAN_QL = 2 WHERE ID_YCTC = ?';

  db.query(updateQuery, [id], (err, result) => {
    if (err) {
      console.error('Lỗi khi cập nhật YEUCAUTHAYCA:', err);
      return res.status(500).send('Đã xảy ra lỗi khi cập nhật thao tác.');
    }
    res.redirect('/quanly/thongbao');
  });
});
//nghỉ phép
app.post('/quanly/xinnghiphep/xacnhan', (req, res) => {
  const { id } = req.body;
  // Lấy thông tin yêu cầu xin nghỉ phép từ database
  db.query('SELECT * FROM xinnghiphep WHERE ID_XNP = ?', [id], (err, results) => {
    if (err) throw err;
    const XINNGHIPHEP = results[0];

    if (!XINNGHIPHEP) {
      return res.status(404).send('Không tìm thấy yêu cầu xin nghỉ phép.');
    }

    // Cập nhật lịch làm để đánh dấu ca làm là nghỉ phép
    const calamuonnghi = XINNGHIPHEP.CALAMMUONNGHI;
    const sqlUpdateLichLam = `
      UPDATE lichlam
      SET ${calamuonnghi} = NULL
      WHERE ID_LL = ? AND NGAY_L = ?
    `;

    db.query(sqlUpdateLichLam, [XINNGHIPHEP.ID_LL, XINNGHIPHEP.NGAY_L], (err, results) => {
      if (err) throw err;

      // Cập nhật trạng thái xác nhận của quản lý trong yêu cầu nghỉ phép
      const sqlUpdateXacNhan = `
        UPDATE xinnghiphep
        SET XACNHAN_QL = 1  -- Xác nhận yêu cầu nghỉ phép
        WHERE ID_XNP = ?
      `;

      db.query(sqlUpdateXacNhan, [id], (err, results) => {
        if (err) throw err;
        res.redirect('/quanly/thongbao');  // Điều hướng về trang thông báo quản lý
      });
    });
  });
});
// hủy nghỉ phép
app.post('/quanly/xinnghiphep/huy', (req, res) => {
  const { id } = req.body;

  // Cập nhật trạng thái yêu cầu xin nghỉ phép thành bị từ chối
  const updateQuery = 'UPDATE xinnghiphep SET XACNHAN_QL = 2 WHERE ID_XNP = ?';

  db.query(updateQuery, [id], (err, result) => {
    if (err) {
      console.error('Lỗi khi cập nhật xinnghiphep:', err);
      return res.status(500).send('Đã xảy ra lỗi khi cập nhật yêu cầu xin nghỉ phép.');
    }
    res.redirect('/quanly/thongbao');  // Điều hướng về trang thông báo quản lý
  });
});
// Tuyến POST để xác nhận
app.post('/nhanvien/thongbao/xacnhan', (req, res) => {
  const id = req.body.id;
  const sql = 'UPDATE YEUCAUTHAYCA SET XACNHAN_NV = ? WHERE ID = ?';
  db.query(sql, ['Đã xác nhận', id], (err, result) => {
    if (err) throw err;
    res.redirect('/nhanvien/lichlamchinhthuc');
  });
});
// Tuyến POST để từ chối
app.post('/nhanvien/thongbao/huy', (req, res) => {
  const id = req.body.id;
  const sql = 'UPDATE YEUCAUTHAYCA SET XACNHAN_NV = ? WHERE ID = ?';
  db.query(sql, ['Từ chối', id], (err, result) => {
    if (err) throw err;
    res.redirect('/nhanvien/lichlamchinhthuc');
  });
});
app.get('/quanly/quanlytrangchu', (req, res) => {
  const selectTrangChuQuery = 'SELECT * FROM trangchu ORDER BY ID_QLTC';

  db.query(selectTrangChuQuery, (err, trangChuResults) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Lỗi khi truy vấn dữ liệu từ bảng trangchu');
    }

    // Render template quanlytrangchu.ejs và truyền dữ liệu vào template
    res.render('quanly/quanlytrangchu', {
      trangChuData: trangChuResults
    });
  });
});
app.post('/nhanvien/thongbao/xoa', (req, res) => {
  const id = req.body.id;
  const query = 'DELETE FROM YEUCAUTHAYCA WHERE ID = ?';

  db.query(query, [id], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).send('Lỗi xóa dữ liệu trong cơ sở dữ liệu');
    }
    res.redirect('/nhanvien/lichlamchinhthuc');
  });
});
//
// Route cập nhật trang chủ
app.post('/quanly/quanlytrangchu/capnhat/:id', upload.single('ANH_TC'), (req, res) => {
  const id = req.params.id;
  const mota = req.body.mota;
  let anh = req.body.anh;

  // Kiểm tra xem có ảnh mới được upload không
  if (req.file) {
    anh = req.file.filename; // Lấy tên file mới
  }

  db.query('UPDATE trangchu SET MOTA_TC = ?, ANH_TC = ? WHERE ID_TC = ?', [mota, anh, id], (err, result) => {
    if (err) throw err;
    res.redirect('/quanly/quanlytrangchu');
  });
});
//
app.post('/quanly/quanlytrangchu/xoa/:id', (req, res) => {
  const id = req.params.id;
  db.query('DELETE FROM trangchu WHERE ID_TC = ?', [id], (err, result) => {
    if (err) throw err;
    res.redirect('/quanly/quanlytrangchu');
  });
});

// Trong file app.js hoặc routes.js
function convertDateFormat(dateString) {
  const parts = dateString.split('/');
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}
app.post('/khachhang/capnhat_giohang/:id', (req, res) => {
  const gioHangId = req.params.id;
  const newQuantity = req.body.SOLUONG;
  // Cập nhật số lượng sản phẩm trong cơ sở dữ liệu
  const query = `UPDATE giohang SET SOLUONG = ? WHERE ID_GH = ?`;
  db.query(query, [newQuantity, gioHangId], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Cập nhật số lượng thất bại');
    }
    res.redirect('/khachhang/kh_sanpham'); // Reload lại trang hiện tại sau khi cập nhật
  });
});
app.post('/nhanvien/datnuoc/:id', (req, res) => {
  const gioHangId = req.params.id;
  const newQuantity = req.body.SOLUONG;
  // Cập nhật số lượng sản phẩm trong cơ sở dữ liệu
  const query = `UPDATE giohangnhanvien SET SOLUONG = ? WHERE ID_GHNV = ?`;
  db.query(query, [newQuantity, gioHangId], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Cập nhật số lượng thất bại');
    }
    res.redirect('/nhanvien/datnuoc'); // Reload lại trang hiện tại sau khi cập nhật
  });
});

const port = 3000;
app.listen(port, () => {
  console.log(`Server đang lắng nghe tại http://localhost:3000/dangnhap`);
});