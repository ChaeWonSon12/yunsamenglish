const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/yunsam.html");
});

// DB 연결
const db = new sqlite3.Database("./users.db");

// users 테이블 만들기
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school TEXT,
    name TEXT,
    code TEXT,
    user_id TEXT UNIQUE,
    password TEXT
  )
`);

// students 테이블 만들기
db.run(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    school TEXT NOT NULL,
    grade TEXT,
    phone TEXT,
    class_name TEXT,
    memo TEXT
  )
`);

// notices 테이블 만들기
db.run(`
  CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 회원가입
app.post("/signup", (req, res) => {
  const { school, name, code, user_id, password } = req.body;

  const sql = `
    INSERT INTO users (school, name, code, user_id, password)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(sql, [school, name, code, user_id, password], function (err) {
    if (err) {
      return res.json({
        success: false,
        message: "이미 존재하는 아이디입니다."
      });
    }

    res.json({
      success: true,
      message: "회원가입 성공"
    });
  });
});

// 로그인
app.post("/login", (req, res) => {
  const { user_id, password } = req.body;

  const sql = `
    SELECT * FROM users
    WHERE user_id = ? AND password = ?
  `;

  db.get(sql, [user_id, password], (err, user) => {
    if (err) {
      return res.json({
        success: false,
        message: "서버 오류"
      });
    }

    if (!user) {
      return res.json({
        success: false,
        message: "아이디 또는 비밀번호가 틀렸습니다."
      });
    }

    res.json({
      success: true,
      message: "로그인 성공",
      user: {
        school: user.school,
        name: user.name,
        code: user.code,
        user_id: user.user_id,
        role: user.user_id === "teacher" ? "teacher" : "student"
      }
    });
  });
});

// 학생 추가
app.post("/students", (req, res) => {
  const { name, school, grade, phone, class_name, memo } = req.body;

  const sql = `
    INSERT INTO students (name, school, grade, phone, class_name, memo)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [name, school, grade, phone, class_name, memo], function (err) {
    if (err) {
      return res.json({
        success: false,
        message: "학생 추가 실패"
      });
    }

    res.json({
      success: true,
      message: "학생 추가 성공",
      id: this.lastID
    });
  });
});

// 학생 목록 불러오기
app.get("/students", (req, res) => {
  const sql = `
    SELECT * FROM students
    ORDER BY id DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.json({
        success: false,
        message: "학생 목록 불러오기 실패"
      });
    }

    res.json({
      success: true,
      students: rows
    });
  });
});

// 학생 삭제
app.delete("/students/:id", (req, res) => {
  const id = req.params.id;

  const sql = `
    DELETE FROM students
    WHERE id = ?
  `;

  db.run(sql, [id], function (err) {
    if (err) {
      return res.json({
        success: false,
        message: "학생 삭제 실패"
      });
    }

    res.json({
      success: true,
      message: "학생 삭제 성공"
    });
  });
});

// 회원가입한 유저 목록 불러오기 - 선생님용
app.get("/users", (req, res) => {
  const sql = `
    SELECT id, school, name, code, user_id
    FROM users
    ORDER BY id DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.json({
        success: false,
        message: "회원 목록 불러오기 실패"
      });
    }

    res.json({
      success: true,
      users: rows
    });
  });
});

// 회원 삭제 - 선생님용
app.delete("/users/:id", (req, res) => {
  const id = req.params.id;

  const sql = `
    DELETE FROM users
    WHERE id = ?
  `;

  db.run(sql, [id], function (err) {
    if (err) {
      return res.json({
        success: false,
        message: "회원 삭제 실패"
      });
    }

    if (this.changes === 0) {
      return res.json({
        success: false,
        message: "해당 회원을 찾을 수 없습니다."
      });
    }

    res.json({
      success: true,
      message: "회원 삭제 성공"
    });
  });
});

// 공지사항 목록 불러오기
app.get("/notices", (req, res) => {
  const sql = `
    SELECT *
    FROM notices
    ORDER BY id DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.json({
        success: false,
        message: "공지사항 불러오기 실패"
      });
    }

    res.json({
      success: true,
      notices: rows
    });
  });
});

// 공지사항 추가 - 선생님용
app.post("/notices", (req, res) => {
  const { title, content } = req.body;

  if (!title || !content) {
    return res.json({
      success: false,
      message: "제목과 내용을 모두 입력하세요."
    });
  }

  const sql = `
    INSERT INTO notices (title, content)
    VALUES (?, ?)
  `;

  db.run(sql, [title, content], function (err) {
    if (err) {
      return res.json({
        success: false,
        message: "공지사항 등록 실패"
      });
    }

    res.json({
      success: true,
      message: "공지사항 등록 성공",
      id: this.lastID
    });
  });
});

// 공지사항 삭제 - 선생님용
app.delete("/notices/:id", (req, res) => {
  const id = req.params.id;

  const sql = `
    DELETE FROM notices
    WHERE id = ?
  `;

  db.run(sql, [id], function (err) {
    if (err) {
      return res.json({
        success: false,
        message: "공지사항 삭제 실패"
      });
    }

    if (this.changes === 0) {
      return res.json({
        success: false,
        message: "해당 공지사항을 찾을 수 없습니다."
      });
    }

    res.json({
      success: true,
      message: "공지사항 삭제 성공"
    });
  });
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});