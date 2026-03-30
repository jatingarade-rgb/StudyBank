const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DB = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Init DB ──
if (!fs.existsSync(DB)) {
  fs.writeFileSync(DB, JSON.stringify({ content: [], admin: { password: 'admin123' } }, null, 2));
}

function read() { return JSON.parse(fs.readFileSync(DB, 'utf-8')); }
function write(d) { fs.writeFileSync(DB, JSON.stringify(d, null, 2)); }

// ── Admin Auth ──
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const { admin } = read();
  if (password === admin.password) res.json({ ok: true });
  else res.status(401).json({ ok: false, error: 'Wrong password' });
});

// ── Get structure (classes, boards, subjects, chapters, exercises) ──
app.get('/api/structure', (req, res) => {
  const { classId, board, subject, chapter, exercise } = req.query;
  const { content } = read();

  if (!classId) {
    const classes = [...new Set(content.map(i => i.class))].sort();
    return res.json(classes);
  }
  let filtered = content.filter(i => i.class === classId);

  if (!board) {
    const boards = [...new Set(filtered.map(i => i.board))].sort();
    return res.json(boards);
  }
  filtered = filtered.filter(i => i.board === board);

  if (!subject) {
    const subjects = [...new Set(filtered.map(i => i.subject))].sort();
    return res.json(subjects);
  }
  filtered = filtered.filter(i => i.subject === subject);

  if (!chapter) {
    const chapters = [...new Set(filtered.map(i => i.chapter))].sort((a,b) => {
      const na = parseInt(a), nb = parseInt(b);
      return isNaN(na)||isNaN(nb) ? a.localeCompare(b) : na - nb;
    });
    return res.json(chapters);
  }
  filtered = filtered.filter(i => i.chapter === chapter);

  if (!exercise) {
    const exercises = [...new Set(filtered.map(i => i.exercise))].sort();
    return res.json(exercises);
  }
  filtered = filtered.filter(i => i.exercise === exercise);

  // Return questions list
  return res.json(filtered.map(i => ({ id: i.id, question: i.question })));
});

// ── Get single Q&A ──
app.get('/api/qa/:id', (req, res) => {
  const { content } = read();
  const item = content.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// ── Search ──
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  const classId = req.query.classId || '';
  if (!q || q.length < 3) return res.json([]);
  const { content } = read();
  let pool = content;
  if (classId) pool = pool.filter(i => i.class === classId);
  const results = pool.filter(i =>
    i.question.toLowerCase().includes(q) ||
    i.subject.toLowerCase().includes(q) ||
    i.chapter.toLowerCase().includes(q)
  ).slice(0, 10);
  res.json(results);
});

// ── Admin: Add Q&A ──
app.post('/api/admin/add', (req, res) => {
  const { password, classId, board, subject, chapter, exercise, question, answer } = req.body;
  const data = read();
  if (password !== data.admin.password) return res.status(401).json({ error: 'Unauthorized' });
  if (!classId || !board || !subject || !chapter || !exercise || !question || !answer)
    return res.status(400).json({ error: 'All fields required' });

  const item = {
    id: Date.now().toString(),
    class: classId, board, subject, chapter, exercise, question, answer,
    createdAt: new Date().toISOString()
  };
  data.content.push(item);
  write(data);
  res.status(201).json(item);
});

// ── Admin: Delete Q&A ──
app.delete('/api/admin/delete/:id', (req, res) => {
  const { password } = req.body;
  const data = read();
  if (password !== data.admin.password) return res.status(401).json({ error: 'Unauthorized' });
  data.content = data.content.filter(i => i.id !== req.params.id);
  write(data);
  res.json({ ok: true });
});

// ── Admin: Change password ──
app.post('/api/admin/changepass', (req, res) => {
  const { password, newPassword } = req.body;
  const data = read();
  if (password !== data.admin.password) return res.status(401).json({ error: 'Unauthorized' });
  data.admin.password = newPassword;
  write(data);
  res.json({ ok: true });
});

// ── Catch-all → SPA ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`✅ StudyBank running → http://localhost:${PORT}`));
