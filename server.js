const express = require('express');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

const DB_PATH = path.join(__dirname, 'submissions.json');
function loadDB() {
    try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
    catch { return {}; }
}
function saveDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

const upload = multer({
    dest: path.join(__dirname, 'uploads'),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// POST /submit — receive photo, store it
app.post('/submit', upload.single('photo'), async (req, res) => {
    try {
        const name = req.body.name || 'Ученик';
        const id = crypto.randomBytes(8).toString('hex');

        const db = loadDB();
        db[id] = {
            name,
            status: 'pending',
            createdAt: new Date().toISOString(),
            photo: req.file ? `/uploads/${req.file.filename}` : null,
            originalName: req.file ? req.file.originalname : null
        };
        saveDB(db);

        console.log(`Submission ${id} from ${name}`);
        res.json({ ok: true, id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /approve/:id
app.get('/approve/:id', (req, res) => {
    const db = loadDB();
    if (db[req.params.id]) {
        db[req.params.id].status = 'approved';
        saveDB(db);
        res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;"><div style="font-size:4rem;">✅</div><h2 style="color:#2EA85C;">Одобрено!</h2><p style="color:#5A4A6A;">Статус ученика обновлён.</p></body></html>`);
    } else {
        res.status(404).send('Not found');
    }
});

// GET /reject/:id
app.get('/reject/:id', (req, res) => {
    const db = loadDB();
    if (db[req.params.id]) {
        db[req.params.id].status = 'disapproved';
        saveDB(db);
        res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;"><div style="font-size:4rem;">🟡</div><h2 style="color:#C89632;">Неточно</h2><p style="color:#5A4A6A;">Статус ученика обновлён.</p></body></html>`);
    } else {
        res.status(404).send('Not found');
    }
});

// GET /status/:id — client polls this
app.get('/status/:id', (req, res) => {
    const db = loadDB();
    const entry = db[req.params.id];
    res.json(entry ? { status: entry.status } : { status: 'not_found' });
});

// Serve uploaded photos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// GET /admin — view all submissions
app.get('/admin', (req, res) => {
    const db = loadDB();
    const entries = Object.entries(db).reverse();
    const rows = entries.map(([id, e]) => `
        <tr>
            <td>${e.name}</td>
            <td>${new Date(e.createdAt).toLocaleString('ru-RU')}</td>
            <td class="status-${e.status}">${e.status === 'pending' ? '⏳ Ожидает' : e.status === 'approved' ? '✅ Одобрено' : '🟡 Неточно'}</td>
            <td>${e.photo ? `<a href="${e.photo}" target="_blank">📷 Фото</a>` : '—'}</td>
            <td>
                ${e.status === 'pending' ? `
                    <a href="/approve/${id}" class="btn-approve">✅ Одобрить</a>
                    <a href="/reject/${id}" class="btn-reject">❌ Отклонить</a>
                ` : '—'}
            </td>
        </tr>
    `).join('');

    res.send(`<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Панель проверки</title>
<style>
    body { font-family: sans-serif; background: #f5f0fa; margin: 0; padding: 20px; color: #3D2A4A; }
    h1 { text-align: center; color: #3D2A4A; }
    table { width: 100%; max-width: 900px; margin: 20px auto; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    th { background: #3D2A4A; color: white; padding: 12px 16px; text-align: left; }
    td { padding: 12px 16px; border-bottom: 1px solid #eee; }
    tr:hover { background: #f8f4fc; }
    .status-pending { color: #c89632; font-weight: bold; }
    .status-approved { color: #2ea85c; font-weight: bold; }
    .status-disapproved { color: #c85050; font-weight: bold; }
    .btn-approve, .btn-reject { display: inline-block; padding: 6px 14px; border-radius: 20px; text-decoration: none; font-size: 13px; font-weight: bold; margin: 2px; }
    .btn-approve { background: #e8f5e9; color: #2ea85c; }
    .btn-reject { background: #fde8e8; color: #c85050; }
    .btn-approve:hover { background: #2ea85c; color: white; }
    .btn-reject:hover { background: #c85050; color: white; }
    .empty { text-align: center; padding: 60px; color: #8A7A9A; }
    .refresh { text-align: center; margin: 10px; }
    .refresh a { color: #3D2A4A; }
</style>
</head>
<body>
    <h1>📄 Панель проверки иероглифов</h1>
    <div class="refresh"><a href="/admin">🔄 Обновить</a></div>
    ${entries.length === 0 ? '<div class="empty">Пока нет заявок 📭</div>' : `
    <table>
        <thead><tr><th>Ученик</th><th>Дата</th><th>Статус</th><th>Фото</th><th>Действие</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>`}
</body></html>`);
});

// Redirect root to admin for convenience
app.get('/', (req, res) => res.redirect('/admin'));

app.listen(PORT, () => {
    console.log(`\n🚀 Сервер запущен: ${PUBLIC_URL}`);
    console.log(`📋 Админ-панель: ${PUBLIC_URL}/admin`);
});
