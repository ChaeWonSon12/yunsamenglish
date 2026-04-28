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
        user_id: user.user_id
      }
    });
  });
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});