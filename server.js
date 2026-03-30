const express = require('express');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URL = 'mongodb+srv://jatingarade_db_user:AZZE4Z5ydQOIHRpj@cluster0.yfofcvk.mongodb.net/?appName=Cluster0';
const DB_NAME = 'studybank';

let db;

// Connect to MongoDB
async function connectDB() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  db = client.db(DB_NAME);
  console.log('✅ Connected to MongoDB Atlas!');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Admin Auth ──
app.post('/api/login', async (req, res) => {
  const { password } = req.body;
  const config = await db.collection('config').findOne({ key: 'admin' });
  const adminPass = config ? config.password : 'admin123';
  if (password === adminPass) res.json({ ok: true });
  else res.status(401).json({ ok: false, error: 'Wrong password' });
});

// ── Get structure ──
app.get('/api/structure', async (req, res) => {
  const { classId, board, subject, chapter, exercise } = req.query;
  const collection = db.collection('content');

  const query = {};
  if (classId) query.class = classId;
  if (board) query.board = board;
  if (subject) query.subject = subject;
  if (chapter) query.chapter = chapter;
  if (exercise) query.exercise = exercise;

  if (!classId) {
    const classes = await collection.distinct('class');
    return res.json(classes.sort());
  }
  if (!board) {
    const boards = await collection.distinct('board', query);
    return res.json(boards.sort());
  }
  if (!subject) {
    const subjects = await collection.distinct('subject', query);
    return res.json(subjects.sort());
  }
  if (!chapter) {
    const chapters = await collection.distinct('chapter', query);
    return res.json(chapters.sort((a, b) => {
      const na = parseInt(a), nb = parseInt(b);
      return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb;
    }));
  }
  if (!exercise) {
    const exercises = await collection.distinct('exercise', query);
    return res.json(exercises.sort());
  }

  // Return questions list
  const items = await collection.find(query).toArray();
  return res.json(items.map(i => ({ id: i._id.toString(), question: i.question })));
});

// ── Get single Q&A ──
app.get('/api/qa/:id', async (req, res) => {
  try {
    const item = await db.collection('content').findOne({ _id: new ObjectId(req.params.id) });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ ...item, id: item._id.toString() });
  } catch (e) {
    res.status(400).json({ error: 'Invalid ID' });
  }
});

// ── Search ──
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  const classId = req.query.classId || '';
  if (!q || q.length < 2) return res.json([]);

  const query = {
    $or: [
      { question: { $regex: q, $options: 'i' } },
      { subject: { $regex: q, $options: 'i' } },
      { chapter: { $regex: q, $options: 'i' } },
      { answer: { $regex: q, $options: 'i' } }
    ]
  };
  if (classId) query.class = classId;

  const results = await db.collection('content').find(query).limit(10).toArray();
  res.json(results.map(i => ({ ...i, id: i._id.toString() })));
});

// ── Admin: Add Q&A ──
app.post('/api/admin/add', async (req, res) => {
  const { password, classId, board, subject, chapter, exercise, question, answer } = req.body;
  const config = await db.collection('config').findOne({ key: 'admin' });
  const adminPass = config ? config.password : 'admin123';
  if (password !== adminPass) return res.status(401).json({ error: 'Unauthorized' });
  if (!classId || !board || !subject || !chapter || !exercise || !question || !answer)
    return res.status(400).json({ error: 'All fields required' });

  const item = {
    class: classId, board, subject, chapter, exercise, question, answer,
    createdAt: new Date()
  };
  const result = await db.collection('content').insertOne(item);
  res.status(201).json({ ...item, id: result.insertedId.toString() });
});

// ── Admin: Delete Q&A ──
app.delete('/api/admin/delete/:id', async (req, res) => {
  const { password } = req.body;
  const config = await db.collection('config').findOne({ key: 'admin' });
  const adminPass = config ? config.password : 'admin123';
  if (password !== adminPass) return res.status(401).json({ error: 'Unauthorized' });
  try {
    await db.collection('content').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Invalid ID' });
  }
});

// ── Admin: Change password ──
app.post('/api/admin/changepass', async (req, res) => {
  const { password, newPassword } = req.body;
  const config = await db.collection('config').findOne({ key: 'admin' });
  const adminPass = config ? config.password : 'admin123';
  if (password !== adminPass) return res.status(401).json({ error: 'Unauthorized' });
  await db.collection('config').updateOne(
    { key: 'admin' },
    { $set: { password: newPassword } },
    { upsert: true }
  );
  res.json({ ok: true });
});

// ── Catch-all → SPA ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
connectDB().then(() => {
  app.listen(PORT, () => console.log(`✅ StudyBank running → http://localhost:${PORT}`));
}).catch(err => {
  console.error('❌ MongoDB connection failed:', err);
  process.exit(1);
});
