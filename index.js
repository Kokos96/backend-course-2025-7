require('dotenv').config(); // Підключаємо роботу з .env файлом
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const http = require('http');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./docs/swagger.json'); // Оновлений шлях до Swagger
const { Pool } = require('pg'); // Підключаємо PostgreSQL

// Отримуємо налаштування з .env
const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';
const cacheDir = process.env.CACHE_DIR || './cache';

// Створюємо папку кешу для фотографій
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Налаштування підключення до бази даних PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const app = express();
const upload = multer({ dest: cacheDir });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Підключення документації
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const methodNotAllowed = (req, res) => res.status(405).send('Method Not Allowed');

// --- Роути (Ендпоінти) ---

// Реєстрація
app.route('/register')
  .post(upload.single('photo'), async (req, res) => {
    try {
      if (!req.body.inventory_name) return res.status(400).send('Bad Request: inventory_name is required');
      
      const photoName = req.file ? req.file.filename : null;
      const description = req.body.description || '';
      
      // Записуємо в БД
      const result = await pool.query(
        'INSERT INTO inventory (inventory_name, description, photo) VALUES ($1, $2, $3) RETURNING *',
        [req.body.inventory_name, description, photoName]
      );
      
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  })
  .all(methodNotAllowed);

// Список усіх речей
app.route('/inventory')
  .get(async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM inventory');
      res.status(200).json(result.rows);
    } catch (err) {
      res.status(500).send('Server Error');
    }
  })
  .all(methodNotAllowed);

// Конкретна річ
app.route('/inventory/:id')
  .get(async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM inventory WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).send('Not found');
      res.status(200).json(result.rows[0]);
    } catch (err) {
      res.status(500).send('Server Error');
    }
  })
  .put(async (req, res) => {
    try {
      const { inventory_name, description } = req.body;
      const result = await pool.query(
        'UPDATE inventory SET inventory_name = COALESCE($1, inventory_name), description = COALESCE($2, description) WHERE id = $3 RETURNING *',
        [inventory_name, description, req.params.id]
      );
      
      if (result.rows.length === 0) return res.status(404).send('Not found');
      res.status(200).json(result.rows[0]);
    } catch (err) {
      res.status(500).send('Server Error');
    }
  })
  .delete(async (req, res) => {
    try {
      const result = await pool.query('DELETE FROM inventory WHERE id = $1 RETURNING *', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).send('Not found');
      res.status(200).send('Deleted successfully');
    } catch (err) {
      res.status(500).send('Server Error');
    }
  })
  .all(methodNotAllowed);

// Фотографії
app.route('/inventory/:id/photo')
  .get(async (req, res) => {
    try {
      const result = await pool.query('SELECT photo FROM inventory WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0 || !result.rows[0].photo) return res.status(404).send('Not found');
      
      const photoPath = path.join(process.cwd(), cacheDir, result.rows[0].photo);
      if (fs.existsSync(photoPath)) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.status(200).sendFile(photoPath);
      } else {
        res.status(404).send('Not found');
      }
    } catch (err) {
      res.status(500).send('Server Error');
    }
  })
  .put(upload.single('photo'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).send('No photo uploaded');
      const result = await pool.query('UPDATE inventory SET photo = $1 WHERE id = $2 RETURNING *', [req.file.filename, req.params.id]);
      if (result.rows.length === 0) return res.status(404).send('Not found');
      res.status(200).send('Photo updated');
    } catch (err) {
      res.status(500).send('Server Error');
    }
  })
  .all(methodNotAllowed);

// Форми та пошук (оновлені шляхи до папки public)
app.get('/RegisterForm.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'RegisterForm.html')));
app.get('/SearchForm.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'SearchForm.html')));

app.route('/search')
  .post(async (req, res) => {
    try {
      const { id, has_photo } = req.body;
      const result = await pool.query('SELECT * FROM inventory WHERE id = $1', [id]);
      if (result.rows.length === 0) return res.status(404).send('Not Found');
      
      let item = result.rows[0];
      if (has_photo === 'on') {
        item.description = `${item.description} (Photo link: /inventory/${item.id}/photo)`;
      }
      res.status(200).json(item);
    } catch (err) {
      res.status(500).send('Server Error');
    }
  })
  .all(methodNotAllowed);

// Запуск
const server = http.createServer(app);
server.listen(port, host, () => {
  console.log(`Сервер запущено на http://${host}:${port}`);
  console.log(`Swagger (Документація): http://${host}:${port}/api-docs`);
});