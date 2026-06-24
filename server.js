const express = require('express');
const multer = require('multer');
const sgMail = require('@sendgrid/mail');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// --- File-based storage ---
const DB_PATH = path.join(__dirname, 'submissions.json');
function loadDB() {
    try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
    catch { return {}; }
}
function saveDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// --- Multer for photos ---
const upload = multer({
    dest: path.join(__dirname, 'uploads'),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// --- SendGrid mail ---
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || process.env.SENDGRID_API_KEY_ENV;
if (SENDGRID_API_KEY) {
    sgMail.setApiKey(SENDGRID_API_KEY);
}

// POST /submit — receive photo, send email with approve/reject buttons
app.post('/submit', upload.single('photo'), async (req, res) => {
    try {
        const name = req.body.name || 'Ученик';
        const id = crypto.randomBytes(8).toString('hex');

        const db = loadDB();
        db[id] = { name, status: 'pending', createdAt: new Date().toISOString() };
        saveDB(db);

        const approveUrl = `${PUBLIC_URL}/approve/${id}`;
        const rejectUrl = `${PUBLIC_URL}/reject/${id}`;

        const attachments = [];
        if (req.file) {
            attachments.push({
                filename: req.file.originalname || 'photo.jpg',
                path: req.file.path
            });
        }

        if (!SENDGRID_API_KEY) {
            console.log(`EMAIL NOT SENT — SENDGRID_API_KEY not configured`);
            return res.status(500).json({ ok: false, error: 'SendGrid not configured on server' });
        }

        const msg = {
            to: 'evg.alis.2001@gmail.com',
            from: 'evg.alis.2001@gmail.com',
            subject: `📄 Проверка иероглифов от ${name}`,
            html: `
                <div style="font-family:sans-serif;max-width:500px;margin:0 auto;text-align:center;">
                    <h2 style="color:#3D2A4A;">📄 Проверка иероглифов</h2>
                    <p style="color:#5A4A6A;">Ученик: <strong>${name}</strong></p>
                    <p style="color:#8A7A9A;">Фото во вложении</p>
                    <div style="margin:32px 0;display:flex;gap:12px;justify-content:center;">
                        <a href="${approveUrl}" style="display:inline-block;padding:14px 32px;border-radius:50px;background:#2EA85C;color:#fff;text-decoration:none;font-weight:700;font-size:16px;">✅ Одобрить</a>
                        <a href="${rejectUrl}" style="display:inline-block;padding:14px 32px;border-radius:50px;background:#C85050;color:#fff;text-decoration:none;font-weight:700;font-size:16px;">❌ Не одобрить</a>
                    </div>
                </div>
            `,
        };
        if (req.file) {
            const fileData = fs.readFileSync(req.file.path);
            msg.attachments = [{
                content: fileData.toString('base64'),
                filename: req.file.originalname || 'photo.jpg',
                type: req.file.mimetype || 'image/jpeg',
                disposition: 'attachment'
            }];
        }
        await sgMail.send(msg);
        console.log(`Email sent for ${id}`);

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

app.listen(PORT, () => {
    console.log(`\n🚀 Сервер запущен: ${PUBLIC_URL}`);
    console.log(`📧 Письма приходят на evg.alis.2001@gmail.com`);
    if (!SENDGRID_API_KEY) {
        console.log(`\n⚠️  SENDGRID_API_KEY не указан. Письма НЕ отправляются.`);
        console.log(`   Добавь SendGrid через Render Dashboard:`);
        console.log(`   Render Dashboard → Environment → Add SendGrid`);
    }
});
