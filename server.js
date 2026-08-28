const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- хранилище (простой JSON-файл, без внешней БД) ----------

function seedData() {
  const col1 = crypto.randomUUID();
  const col2 = crypto.randomUUID();
  const col3 = crypto.randomUUID();
  return {
    title: 'Доска задач',
    columns: [
      { id: col1, name: 'Нужно сделать' },
      { id: col2, name: 'В работе' },
      { id: col3, name: 'Готово' },
    ],
    cards: [
      {
        id: crypto.randomUUID(),
        columnId: col1,
        title: 'Добавьте первую задачу',
        desc: 'Нажмите «+ добавить карточку» внизу колонки',
        label: 'brass',
        createdAt: Date.now(),
      },
    ],
  };
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const seed = seedData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    // повреждённый файл — пересоздаём с чистого листа, не роняя сервер
    const seed = seedData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let data = loadData();

// ---------- вспомогательные функции ----------

function findColumn(id) {
  return data.columns.find((c) => c.id === id);
}

function findCard(id) {
  return data.cards.find((c) => c.id === id);
}

function notFound(res, what) {
  return res.status(404).json({ error: `${what} не найден(а)` });
}

// ---------- состояние доски целиком ----------

app.get('/api/state', (req, res) => {
  res.json(data);
});

app.patch('/api/title', (req, res) => {
  const { title } = req.body;
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title обязателен' });
  }
  data.title = title.trim();
  saveData(data);
  res.json({ title: data.title });
});

// ---------- колонки ----------

app.post('/api/columns', (req, res) => {
  const { name } = req.body;
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name обязателен' });
  }
  const column = { id: crypto.randomUUID(), name: name.trim() };
  data.columns.push(column);
  saveData(data);
  res.status(201).json(column);
});

app.patch('/api/columns/:id', (req, res) => {
  const column = findColumn(req.params.id);
  if (!column) return notFound(res, 'Столбец');
  const { name } = req.body;
  if (typeof name === 'string' && name.trim()) column.name = name.trim();
  saveData(data);
  res.json(column);
});

app.delete('/api/columns/:id', (req, res) => {
  const column = findColumn(req.params.id);
  if (!column) return notFound(res, 'Столбец');
  data.columns = data.columns.filter((c) => c.id !== req.params.id);
  data.cards = data.cards.filter((c) => c.columnId !== req.params.id);
  saveData(data);
  res.status(204).end();
});

// ---------- карточки ----------

app.post('/api/cards', (req, res) => {
  const { columnId, title } = req.body;
  if (!findColumn(columnId)) return notFound(res, 'Столбец');
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title обязателен' });
  }
  const card = {
    id: crypto.randomUUID(),
    columnId,
    title: title.trim(),
    desc: '',
    label: 'none',
    createdAt: Date.now(),
  };
  data.cards.push(card);
  saveData(data);
  res.status(201).json(card);
});

app.patch('/api/cards/:id', (req, res) => {
  const card = findCard(req.params.id);
  if (!card) return notFound(res, 'Карточка');
  const { title, desc, label } = req.body;
  if (typeof title === 'string' && title.trim()) card.title = title.trim();
  if (typeof desc === 'string') card.desc = desc;
  if (typeof label === 'string') card.label = label;
  saveData(data);
  res.json(card);
});

app.delete('/api/cards/:id', (req, res) => {
  const card = findCard(req.params.id);
  if (!card) return notFound(res, 'Карточка');
  data.cards = data.cards.filter((c) => c.id !== req.params.id);
  saveData(data);
  res.status(204).end();
});

// перемещение карточки в другой столбец (в конец списка)
app.post('/api/cards/:id/move', (req, res) => {
  const card = findCard(req.params.id);
  if (!card) return notFound(res, 'Карточка');
  const { columnId } = req.body;
  if (!findColumn(columnId)) return notFound(res, 'Столбец назначения');

  card.columnId = columnId;
  // переносим карточку в конец общего массива, чтобы она оказалась
  // последней при отображении в целевом столбце
  data.cards = data.cards.filter((c) => c.id !== card.id);
  data.cards.push(card);

  saveData(data);
  res.json(card);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kanban-доска запущена: http://localhost:${PORT}`);
});
