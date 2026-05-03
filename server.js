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
    user_id TEXT UNIQUE,
    password TEXT,
    user_class TEXT,
    status TEXT DEFAULT 'pending'
  )
`);

db.run(`
  UPDATE users
  SET status = 'approved'
  WHERE status IS NULL OR user_id = '0000'
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
    target_class TEXT NOT NULL DEFAULT 'all',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 시험 및 출결 기록 테이블 만들기
db.run(`
  CREATE TABLE IF NOT EXISTS test_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_month TEXT NOT NULL,
    user_id TEXT NOT NULL,
    week TEXT NOT NULL,
    attendance TEXT,
    vocab_result TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(record_month, user_id, week)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS test_ranges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_month TEXT NOT NULL,
    user_class TEXT NOT NULL,
    week TEXT NOT NULL,
    vocab_range TEXT NOT NULL,
    UNIQUE(record_month, user_class, week)
  )
`);

//숙제 테이블
db.run(`
  CREATE TABLE IF NOT EXISTS homeworks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    target_class TEXT NOT NULL,
    due_date TEXT,
    file_name TEXT,
    file_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 월별 전체 데일리 개수 테이블
db.run(`
  CREATE TABLE IF NOT EXISTS daily_totals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_month TEXT NOT NULL,
    user_class TEXT NOT NULL,
    total_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(record_month, user_class)
  )
`);

// 학생별 월별 데일리 수행 개수 테이블
db.run(`
  CREATE TABLE IF NOT EXISTS daily_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_month TEXT NOT NULL,
    user_id TEXT NOT NULL,
    done_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(record_month, user_id)
  )
`);

// 회원가입
app.post("/signup", (req, res) => {
  const { school, name, user_id, password, user_class } = req.body;

  const sql = `
    INSERT INTO users (school, name, user_class, user_id, password, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `;

  db.run(sql, [school, name, user_class, user_id, password], function (err) {
    if (err) {
      return res.json({
        success: false,
        message: "이미 존재하는 출석코드입니다."
      });
    }

    res.json({
      success: true,
      message: "회원가입 신청 완료. 선생님 승인 후 로그인할 수 있습니다."
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

    if (user.user_id  !== "0000" && user.status !== "approved") {
      return res.json({
        success: false,
        message: "아직 선생님 승인이 완료되지 않았습니다."
      });
    }

    res.json({
      success: true,
      message: "로그인 성공",
      user: {
        school: user.school,
        name: user.name,
        user_class: user.user_class,
        user_id: user.user_id,
        role: user.user_id === "0000" ? "teacher" : "student"
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
  const userClass = req.query.class;
  const status = req.query.status;

  let sql = `
    SELECT id, school, name, user_class, user_id, status
    FROM users
    WHERE user_id != '0000'
  `;

  const params = [];

  if (userClass) {
    sql += ` AND user_class = ? `;
    params.push(userClass);
  }

  if (status) {
    sql += ` AND status = ? `;
    params.push(status);
  }

  sql += `
    ORDER BY user_class ASC, name ASC
  `;

  db.all(sql, params, (err, rows) => {
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
  const userClass = req.query.class;

  let sql;
  let params = [];

  if (userClass) {
    sql = `
      SELECT *
      FROM notices
      WHERE target_class = 'all' OR target_class = ?
      ORDER BY id DESC
    `;
    params = [userClass];
  } else {
    sql = `
      SELECT *
      FROM notices
      ORDER BY id DESC
    `;
  }

  db.all(sql, params, (err, rows) => {
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
  const { title, content, target_classes } = req.body;

  if (!title || !content) {
    return res.json({
      success: false,
      message: "제목과 내용을 모두 입력하세요."
    });
  }

  if (!target_classes || target_classes.length === 0) {
    return res.json({
      success: false,
      message: "공지할 반을 선택하세요."
    });
  }

  const sql = `
    INSERT INTO notices (title, content, target_class)
    VALUES (?, ?, ?)
  `;

  let completed = 0;
  let hasError = false;

  target_classes.forEach(targetClass => {
    db.run(sql, [title, content, targetClass], function (err) {
      completed++;

      if (err) {
        hasError = true;
      }

      if (completed === target_classes.length) {
        if (hasError) {
          return res.json({
            success: false,
            message: "공지사항 등록 실패"
          });
        }

        res.json({
          success: true,
          message: "공지사항 등록 성공"
        });
      }
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

// 선생님이 학생 계정 직접 추가
app.post("/users", (req, res) => {
  const { school, name, user_class, user_id, password } = req.body;

  if (!school || !name || !user_class || !user_id || !password) {
    return res.json({
      success: false,
      message: "모든 정보를 입력하세요."
    });
  }

  const sql = `
    INSERT INTO users (school, name, user_class, user_id, password, status)
    VALUES (?, ?, ?, ?, ?, 'approved')
  `;

  db.run(sql, [school, name, user_class, user_id, password], function (err) {
    if (err) {
      return res.json({
        success: false,
        message: "이미 존재하는 출석코드입니다."
      });
    }

    res.json({
      success: true,
      message: "학생 계정 추가 성공",
      id: this.lastID
    });
  });
});

// 시험 및 출결 기록 불러오기
app.get("/records", (req, res) => {
  const userClass = req.query.class;
  const recordMonth = req.query.month;

  if (!userClass || !recordMonth) {
    return res.json({
      success: false,
      message: "반과 월을 선택하세요."
    });
  }

  const sql = `
    SELECT 
      u.user_id,
      u.name,
      u.school,
      u.user_class,
      r.week,
      r.attendance,
      r.vocab_result
    FROM users u
    LEFT JOIN test_records r
      ON u.user_id = r.user_id
      AND r.record_month = ?
    WHERE u.user_class = ?
    ORDER BY u.name ASC
  `;

  db.all(sql, [recordMonth, userClass], (err, rows) => {
    if (err) {
      return res.json({
        success: false,
        message: "기록 불러오기 실패"
      });
    }

    res.json({
      success: true,
      records: rows
    });
  });
});

// 시험 및 출결 기록 저장
app.post("/records", (req, res) => {
  const { record_month, user_id, week, attendance, vocab_result } = req.body;

  if (!record_month || !user_id || !week) {
    return res.json({
      success: false,
      message: "month, 학생과 주차 정보가 필요합니다."
    });
  }

  const sql = `
    INSERT INTO test_records (record_month, user_id, week, attendance, vocab_result)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(record_month, user_id, week)
    DO UPDATE SET
      attendance = excluded.attendance,
      vocab_result = excluded.vocab_result
  `;

  db.run(sql, [record_month, user_id, week, attendance, vocab_result], function (err) {
    if (err) {
      return res.json({
        success: false,
        message: "기록 저장 실패"
      });
    }

    res.json({
      success: true,
      message: "저장 완료"
    });
  });
});

// 학생 본인 기록 불러오기
app.get("/my-records/:user_id", (req, res) => {
  const user_id = req.params.user_id;
  const recordMonth = req.query.month;

  if (!recordMonth) {
    return res.json({
      success: false,
      message: "월 정보가 필요합니다."
    });
  }

  const sql = `
    SELECT week, attendance, vocab_result
    FROM test_records
    WHERE user_id = ?
      AND record_month = ?
    ORDER BY week ASC
  `;

  db.all(sql, [user_id, recordMonth], (err, rows) => {
    if (err) {
      return res.json({
        success: false,
        message: "기록 불러오기 실패"
      });
    }

    res.json({
      success: true,
      records: rows
    });
  });
});

app.patch("/users/:id/approve", (req, res) => {
  const id = req.params.id;

  const sql = `
    UPDATE users
    SET status = 'approved'
    WHERE id = ?
  `;

  db.run(sql, [id], function (err) {
    if (err) {
      return res.json({
        success: false,
        message: "승인 실패"
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
      message: "회원 승인 완료"
    });
  });
});

app.patch("/change-password", (req, res) => {
  const { user_id, current_password, new_password } = req.body;

  if (!user_id || !current_password || !new_password) {
    return res.json({
      success: false,
      message: "필수 정보가 부족합니다."
    });
  }

  const checkSql = `
    SELECT * FROM users
    WHERE user_id = ? AND password = ?
  `;

  db.get(checkSql, [user_id, current_password], (err, user) => {
    if (err) {
      return res.json({
        success: false,
        message: "서버 오류"
      });
    }

    if (!user) {
      return res.json({
        success: false,
        message: "현재 비밀번호가 틀렸습니다."
      });
    }

    const updateSql = `
      UPDATE users
      SET password = ?
      WHERE user_id = ?
    `;

    db.run(updateSql, [new_password, user_id], function (err) {
      if (err) {
        return res.json({
          success: false,
          message: "비밀번호 변경 실패"
        });
      }

      res.json({
        success: true,
        message: "비밀번호가 변경되었습니다. 다시 로그인해주세요."
      });
    });
  });
});

app.get("/homeworks", (req, res) => {
  const userClass = req.query.class;

  let sql;
  let params = [];

  if (userClass) {
    sql = `
      SELECT *
      FROM homeworks
      WHERE target_class = 'all' OR target_class = ?
      ORDER BY id DESC
    `;
    params = [userClass];
  } else {
    sql = `
      SELECT *
      FROM homeworks
      ORDER BY id DESC
    `;
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.json({
        success: false,
        message: "숙제 불러오기 실패"
      });
    }

    res.json({
      success: true,
      homeworks: rows
    });
  });
});

app.post("/homeworks", (req, res) => {
  const { title, content, target_classes } = req.body;

  if (!title || !content) {
    return res.json({
      success: false,
      message: "숙제 제목과 내용을 입력하세요."
    });
  }

  if (!target_classes || target_classes.length === 0) {
    return res.json({
      success: false,
      message: "반을 선택하세요."
    });
  }

  const sql = `
    INSERT INTO homeworks (title, content, target_class)
    VALUES (?, ?, ?)
  `;

  let completed = 0;
  let hasError = false;

  target_classes.forEach(targetClass => {
    db.run(
      sql,
      [title, content, targetClass],
      function (err) {
        completed++;

        if (err) {
          hasError = true;
        }

        if (completed === target_classes.length) {
          if (hasError) {
            return res.json({
              success: false,
              message: "숙제 등록 실패"
            });
          }

          res.json({
            success: true,
            message: "숙제 등록 성공"
          });
        }
      }
    );
  });
});

app.delete("/homeworks/:id", (req, res) => {
  const id = req.params.id;

  const sql = `
    DELETE FROM homeworks
    WHERE id = ?
  `;

  db.run(sql, [id], function (err) {
    if (err) {
      return res.json({
        success: false,
        message: "숙제 삭제 실패"
      });
    }

    res.json({
      success: true,
      message: "숙제 삭제 성공"
    });
  });
});

app.get("/test-ranges", (req, res) => {
  const userClass = req.query.class;
  const recordMonth = req.query.month;

  if (!userClass || !recordMonth) {
    return res.json({
      success: false,
      message: "반과 월 정보가 필요합니다."
    });
  }

  const sql = `
    SELECT week, vocab_range
    FROM test_ranges
    WHERE user_class = ?
      AND record_month = ?
  `;

  db.all(sql, [userClass, recordMonth], (err, rows) => {
    if (err) {
      return res.json({
        success: false,
        message: "단어 범위 불러오기 실패"
      });
    }

    res.json({
      success: true,
      ranges: rows
    });
  });
});

app.post("/test-ranges", (req, res) => {
  const { record_month, user_class, week, vocab_range } = req.body;

  if (!record_month || !user_class || !week || !vocab_range) {
    return res.json({
      success: false,
      message: "필수 정보가 부족합니다."
    });
  }

  const sql = `
    INSERT INTO test_ranges (record_month, user_class, week, vocab_range)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(record_month, user_class, week)
    DO UPDATE SET
      vocab_range = excluded.vocab_range
  `;

  db.run(sql, [record_month, user_class, week, vocab_range], function (err) {
    if (err) {
      return res.json({
        success: false,
        message: "단어 범위 저장 실패"
      });
    }

    res.json({
      success: true,
      message: "단어 범위 저장 완료"
    });
  });
});

// 월별 데일리 현황 불러오기
app.get("/daily-summary", (req, res) => {
  const userClass = req.query.class;

  if (!userClass) {
    return res.json({
      success: false,
      message: "반 정보가 필요합니다."
    });
  }

  const totalSql = `
    SELECT record_month, user_class, total_count
    FROM daily_totals
    WHERE user_class = ?
  `;

  const countSql = `
    SELECT
      u.user_id,
      u.name,
      u.school,
      u.user_class,
      dc.record_month,
      dc.done_count
    FROM users u
    LEFT JOIN daily_counts dc
      ON u.user_id = dc.user_id
    WHERE u.user_class = ?
      AND u.status = 'approved'
      AND u.user_id != '0000'
    ORDER BY u.name ASC
  `;

  db.all(totalSql, [userClass], (err, totalRows) => {
    if (err) {
      return res.json({
        success: false,
        message: "전체 데일리 개수 불러오기 실패"
      });
    }

    db.all(countSql, [userClass], (err, countRows) => {
      if (err) {
        return res.json({
          success: false,
          message: "학생별 데일리 개수 불러오기 실패"
        });
      }

      const totalDailies = totalRows.map(row => ({
        record_month: row.record_month,
        month: row.record_month,
        total_count: row.total_count
      }));

      const records = countRows
        .filter(row => row.record_month !== null)
        .map(row => ({
          user_id: row.user_id,
          name: row.name,
          record_month: row.record_month,
          month: row.record_month,
          done_count: row.done_count || 0
        }));

      res.json({
        success: true,
        totalDailies,
        records
      });
    });
  });
});

// 월별 전체 데일리 개수 저장
app.post("/daily-total", (req, res) => {
  const { record_month, user_class, total_count } = req.body;

  if (!record_month || !user_class) {
    return res.json({
      success: false,
      message: "월과 반 정보가 필요합니다."
    });
  }

  const sql = `
    INSERT INTO daily_totals (record_month, user_class, total_count)
    VALUES (?, ?, ?)
    ON CONFLICT(record_month, user_class)
    DO UPDATE SET
      total_count = excluded.total_count
  `;

  db.run(sql, [record_month, user_class, total_count || 0], function (err) {
    if (err) {
      return res.json({
        success: false,
        message: "전체 데일리 개수 저장 실패"
      });
    }

    res.json({
      success: true,
      message: "전체 데일리 개수 저장 완료"
    });
  });
});

// 학생별 월별 수행 개수 저장
app.post("/daily-count", (req, res) => {
  const { record_month, user_id, done_count } = req.body;

  if (!record_month || !user_id) {
    return res.json({
      success: false,
      message: "월과 학생 정보가 필요합니다."
    });
  }

  const sql = `
    INSERT INTO daily_counts (record_month, user_id, done_count)
    VALUES (?, ?, ?)
    ON CONFLICT(record_month, user_id)
    DO UPDATE SET
      done_count = excluded.done_count
  `;

  db.run(sql, [record_month, user_id, done_count || 0], function (err) {
    if (err) {
      return res.json({
        success: false,
        message: "수행 개수 저장 실패"
      });
    }

    res.json({
      success: true,
      message: "수행 개수 저장 완료"
    });
  });
});

// 학생 본인 데일리 기록 불러오기
app.get("/my-daily/:user_id", (req, res) => {
  const user_id = req.params.user_id;
  const userClass = req.query.class;

  if (!user_id || !userClass) {
    return res.json({
      success: false,
      message: "학생 정보와 반 정보가 필요합니다."
    });
  }

  const totalSql = `
    SELECT record_month, user_class, total_count
    FROM daily_totals
    WHERE user_class = ?
    ORDER BY record_month ASC
  `;

  const recordSql = `
    SELECT record_month, user_id, done_count
    FROM daily_counts
    WHERE user_id = ?
    ORDER BY record_month ASC
  `;

  db.all(totalSql, [userClass], (err, totalRows) => {
    if (err) {
      return res.json({
        success: false,
        message: "전체 데일리 개수 불러오기 실패"
      });
    }

    db.all(recordSql, [user_id], (err, recordRows) => {
      if (err) {
        return res.json({
          success: false,
          message: "학생 데일리 기록 불러오기 실패"
        });
      }

      const totalDailies = totalRows.map(row => ({
        record_month: row.record_month,
        month: row.record_month,
        total_count: row.total_count
      }));

      const records = recordRows.map(row => ({
        record_month: row.record_month,
        month: row.record_month,
        user_id: row.user_id,
        done_count: row.done_count
      }));

      res.json({
        success: true,
        totalDailies,
        records
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});