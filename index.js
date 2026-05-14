const { program } = require('commander');
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const http = require('http');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

// 1. Налаштування аргументів командного рядка
program
  .requiredOption('-h, --host <host>', 'адреса сервера')
  .requiredOption('-p, --port <port>', 'порт сервера')
  .requiredOption('-c, --cache <cache>', 'шлях до директорії з кешем');

program.parse();
const options = program.opts();

// Створення папки кешу
if (!fs.existsSync(options.cache)) {
  fs.mkdirSync(options.cache, { recursive: true });
}

// 2. Робота з базою даних у файлі
const dbFilePath = path.join(options.cache, 'database.json');

function readDb() {
  if (!fs.existsSync(dbFilePath)) return { currentId: 1, items: [] };
  return JSON.parse(fs.readFileSync(dbFilePath, 'utf8'));
}

function writeDb(data) {
  fs.writeFileSync(dbFilePath, JSON.stringify(data, null, 2), 'utf8');
}

// 3. Налаштування Express
const app = express();
const upload = multer({ dest: options.cache });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Підключення Swagger документації
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const methodNotAllowed = (req, res) => res.status(405).send('Method Not Allowed');

// --- Роути (Ендпоінти) ---

// Реєстрація
app.route('/register')
  .post(upload.single('photo'), (req, res) => {
    if (!req.body.inventory_name) return res.status(400).send('Bad Request: inventory_name is required');
    
    const db = readDb();
    const newItem = {
      id: db.currentId.toString(),
      inventory_name: req.body.inventory_name,
      description: req.body.description || '',
      photo: req.file ? req.file.filename : null
    };
    
    db.items.push(newItem);
    db.currentId++;
    writeDb(db);
    res.status(201).json(newItem);
  })
  .all(methodNotAllowed);

// Список усіх речей
app.route('/inventory')
  .get((req, res) => res.status(200).json(readDb().items))
  .all(methodNotAllowed);

// Конкретна річ
app.route('/inventory/:id')
  .get((req, res) => {
    const item = readDb().items.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not found');
    res.status(200).json(item);
  })
  .put((req, res) => {
    const db = readDb();
    const item = db.items.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not found');
    
    if (req.body.inventory_name) item.inventory_name = req.body.inventory_name;
    if (req.body.description) item.description = req.body.description;
    
    writeDb(db);
    res.status(200).json(item);
  })
  .delete((req, res) => {
    const db = readDb();
    const index = db.items.findIndex(i => i.id === req.params.id);
    if (index === -1) return res.status(404).send('Not found');
    
    db.items.splice(index, 1);
    writeDb(db);
    res.status(200).send('Deleted successfully');
  })
  .all(methodNotAllowed);

// Фотографії
app.route('/inventory/:id/photo')
  .get((req, res) => {
    const item = readDb().items.find(i => i.id === req.params.id);
    if (!item || !item.photo) return res.status(404).send('Not found');
    
    const photoPath = path.join(process.cwd(), options.cache, item.photo);
    res.setHeader('Content-Type', 'image/jpeg');
    res.status(200).sendFile(photoPath);
  })
  .put(upload.single('photo'), (req, res) => {
    const db = readDb();
    const item = db.items.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not found');
    if (!req.file) return res.status(400).send('No photo uploaded');

    item.photo = req.file.filename;
    writeDb(db);
    res.status(200).send('Photo updated');
  })
  .all(methodNotAllowed);

// Форми та пошук
app.get('/RegisterForm.html', (req, res) => res.sendFile(path.join(__dirname, 'RegisterForm.html')));
app.get('/SearchForm.html', (req, res) => res.sendFile(path.join(__dirname, 'SearchForm.html')));

app.route('/search')
  .post((req, res) => {
    const { id, has_photo } = req.body;
    const item = readDb().items.find(i => i.id === id);
    if (!item) return res.status(404).send('Not Found');
    
    let result = { ...item };
    if (has_photo === 'on') {
      result.description = `${result.description} (Photo link: /inventory/${item.id}/photo)`;
    }
    res.status(200).json(result);
  })
  .all(methodNotAllowed);

// Запуск
const server = http.createServer(app);
server.listen(options.port, options.host, () => {
  console.log(`Сервер: http://${options.host}:${options.port}`);
  console.log(`Swagger (Документація): http://${options.host}:${options.port}/api-docs`);
});