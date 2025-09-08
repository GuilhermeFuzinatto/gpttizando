const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Cria/abre o banco na raiz do Replit
const db = new sqlite3.Database('quiz.db', (err) => {
  if (err) console.error("Erro ao abrir banco:", err.message);
  else console.log("Banco conectado/criado com sucesso!");
});

// Cria tabelas se não existirem
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS quiz (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    descricao TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pergunta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    enunciado TEXT NOT NULL,
    FOREIGN KEY (quiz_id) REFERENCES quiz(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS alternativa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pergunta_id INTEGER NOT NULL,
    texto TEXT NOT NULL,
    correta BOOLEAN NOT NULL DEFAULT 0,
    FOREIGN KEY (pergunta_id) REFERENCES pergunta(id) ON DELETE CASCADE
  )`);

  console.log("Tabelas criadas/confirmadas");
});

// Criar quiz com perguntas e alternativas
app.post('/quiz', (req, res) => {
  const { titulo, descricao, perguntas } = req.body;

  if (!titulo || !perguntas || perguntas.length === 0) {
    return res.status(400).json({ error: "Quiz deve ter título e pelo menos uma pergunta" });
  }

  db.serialize(() => {
    db.run(`INSERT INTO quiz (titulo, descricao) VALUES (?, ?)`, [titulo, descricao], function(err) {
      if (err) return res.status(500).json({ error: err.message });

      const quizId = this.lastID;

      perguntas.forEach(pergunta => {
        db.run(`INSERT INTO pergunta (quiz_id, enunciado) VALUES (?, ?)`, [quizId, pergunta.enunciado], function(err) {
          if (err) return console.error(err.message);

          const perguntaId = this.lastID;
          pergunta.alternativas.forEach(alt => {
            db.run(`INSERT INTO alternativa (pergunta_id, texto, correta) VALUES (?, ?, ?)`,
              [perguntaId, alt.texto, alt.correta ? 1 : 0]);
          });
        });
      });

      res.json({ message: "Quiz criado com sucesso!", quizId });
    });
  });
});

// Listar quizzes
app.get('/quiz', (req, res) => {
  db.all(`SELECT * FROM quiz ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Obter quiz completo
app.get('/quiz/:id', (req, res) => {
  const { id } = req.params;

  db.all(`
    SELECT q.id as quiz_id, q.titulo, q.descricao,
           p.id as pergunta_id, p.enunciado,
           a.id as alternativa_id, a.texto, a.correta
    FROM quiz q
    JOIN pergunta p ON q.id = p.quiz_id
    JOIN alternativa a ON p.id = a.pergunta_id
    WHERE q.id = ?;
  `, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!rows || rows.length === 0) return res.status(404).json({ error: "Quiz não encontrado" });

    const quiz = {
      id: rows[0].quiz_id,
      titulo: rows[0].titulo,
      descricao: rows[0].descricao,
      perguntas: []
    };

    const perguntasMap = {};
    rows.forEach(r => {
      if (!perguntasMap[r.pergunta_id]) {
        perguntasMap[r.pergunta_id] = { id: r.pergunta_id, enunciado: r.enunciado, alternativas: [] };
        quiz.perguntas.push(perguntasMap[r.pergunta_id]);
      }

      perguntasMap[r.pergunta_id].alternativas.push({
        id: r.alternativa_id,
        texto: r.texto,
        correta: !!r.correta
      });
    });

    res.json(quiz);
  });
});

app.listen(port, () => console.log(`Servidor rodando em http://localhost:${port}`));
