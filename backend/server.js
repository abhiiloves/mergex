require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const winston = require('winston');
const db = require('./db');
const bartenderRoutes = require('./bartender');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'DELETE']
  }
});

app.use(cors());
app.use(express.json());
app.use(helmet());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per windowMs
  message: { success: false, error: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login requests per windowMs
  message: { success: false, error: 'Too many login attempts from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use((req, res, next) => {
  req.io = io;
  req.logger = logger;
  next();
});

io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Run schema.sql to ensure tables exist
async function initDb() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    const statements = schema.split(';').filter(stmt => stmt.trim() !== '');
    for (let stmt of statements) {
      await db.query(stmt);
    }
    // Migration: add lines column to users table if it doesn't exist
    try { await db.query('ALTER TABLE users ADD COLUMN `lines` JSON'); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.error('Migration error:', e); }
    try { await db.query('ALTER TABLE qr_config ADD COLUMN prefix VARCHAR(255) DEFAULT ""'); } catch (e) {}
    try { await db.query('ALTER TABLE qr_config ADD COLUMN suffix VARCHAR(255) DEFAULT ""'); } catch (e) {}
    try { await db.query('ALTER TABLE qr_config ADD COLUMN month_format VARCHAR(10) DEFAULT "MM"'); } catch (e) {}
    try { await db.query('ALTER TABLE qr_config ADD COLUMN year_format VARCHAR(10) DEFAULT "YY"'); } catch (e) {}
    try { await db.query('ALTER TABLE qr_config ADD COLUMN week_format VARCHAR(10) DEFAULT "WW"'); } catch (e) {}
    try { await db.query('ALTER TABLE qr_config ADD COLUMN sap_length INT DEFAULT 10'); } catch (e) {}
    try { await db.query('ALTER TABLE qr_config ADD COLUMN auto_inc_length INT DEFAULT 6'); } catch (e) {}
    try { await db.query('ALTER TABLE qr_config ADD COLUMN config_password VARCHAR(255) DEFAULT "admin@pg123"'); } catch (e) {}
    try { await db.query("ALTER TABLE qr_logs ADD COLUMN print_status ENUM('pending', 'success', 'failed') DEFAULT 'success'"); } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.error('Migration error:', e); }
    
    // Performance indexes
    try { await db.query('CREATE INDEX idx_qr_logs_timestamp ON qr_logs(timestamp)'); } catch (e) { if (e.code !== 'ER_DUP_KEYNAME') console.error('Index error:', e); }
    try { await db.query('CREATE INDEX idx_qr_logs_plant_loc_line ON qr_logs(plant, location, line)'); } catch (e) { if (e.code !== 'ER_DUP_KEYNAME') console.error('Index error:', e); }
    try { await db.query('CREATE INDEX idx_qr_logs_user ON qr_logs(user_email)'); } catch (e) { if (e.code !== 'ER_DUP_KEYNAME') console.error('Index error:', e); }
    try { await db.query('CREATE INDEX idx_qr_logs_codes ON qr_logs(qr_code, new_qr_code, sap_code)'); } catch (e) { if (e.code !== 'ER_DUP_KEYNAME') console.error('Index error:', e); }

    console.log('Database schema initialized.');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

initDb();

// ===== AUTH =====
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password]);
    if (rows.length > 0) {
      const user = rows[0];
      // Parse JSON fields
      if (user.locations && typeof user.locations === 'string') {
        try { user.locations = JSON.parse(user.locations); } catch (e) {}
      }
      if (user.lines && typeof user.lines === 'string') {
        try { user.lines = JSON.parse(user.lines); } catch (e) {}
      }
      res.json({ success: true, user });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== CONFIG =====
app.get('/api/config', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT length, pattern, sequenceValidation, prefix, suffix, month_format, year_format, week_format, sap_length, auto_inc_length FROM qr_config WHERE id = 1');
    const [plantRows] = await db.query('SELECT * FROM qr_config_plant');
    let globalConfig = { 
      length: 22, pattern: 'numeric', sequenceValidation: false,
      prefix: '', suffix: '', month_format: 'MM', year_format: 'YY',
      week_format: 'WW', sap_length: 10, auto_inc_length: 6
    };
    if (rows.length > 0) {
      globalConfig = { ...rows[0], sequenceValidation: !!rows[0].sequenceValidation };
    }
    
    res.json({ 
      success: true, 
      config: globalConfig,
      plants: plantRows.map(r => ({...r, sequenceValidation: !!r.sequenceValidation}))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/config/verify-password', async (req, res) => {
  try {
    const { password } = req.body;
    const [rows] = await db.query('SELECT config_password FROM qr_config WHERE id = 1');
    const actual = rows.length > 0 && rows[0].config_password ? rows[0].config_password : 'admin@pg123';
    if (password === actual) {
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'Incorrect password' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/config/change-password', async (req, res) => {
  try {
    const { password } = req.body;
    await db.query('UPDATE qr_config SET config_password = ? WHERE id = 1', [password]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/config', async (req, res) => {
  const { length, pattern, sequenceValidation, prefix, suffix, month_format, year_format, week_format, sap_length, auto_inc_length } = req.body;
  try {
    await db.query('UPDATE qr_config SET length = ?, pattern = ?, sequenceValidation = ?, prefix = ?, suffix = ?, month_format = ?, year_format = ?, week_format = ?, sap_length = ?, auto_inc_length = ? WHERE id = 1', 
      [length, pattern, sequenceValidation ? 1 : 0, prefix || '', suffix || '', month_format || 'MM', year_format || 'YY', week_format || 'WW', sap_length || 10, auto_inc_length || 6]);
    req.io.emit('config_updated');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/config/plant', async (req, res) => {
  const { location, plant, length, pattern, sequenceValidation, prefix, suffix, month_format, year_format, week_format, sap_length, auto_inc_length } = req.body;
  try {
    await db.query(`
      INSERT INTO qr_config_plant (location, plant, length, pattern, sequenceValidation, prefix, suffix, month_format, year_format, week_format, sap_length, auto_inc_length) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
      length=?, pattern=?, sequenceValidation=?, prefix=?, suffix=?, month_format=?, year_format=?, week_format=?, sap_length=?, auto_inc_length=?
    `, [
      location, plant, length, pattern, sequenceValidation ? 1 : 0, prefix || '', suffix || '', month_format || 'MM', year_format || 'YY', week_format || 'WW', sap_length || 10, auto_inc_length || 6,
      length, pattern, sequenceValidation ? 1 : 0, prefix || '', suffix || '', month_format || 'MM', year_format || 'YY', week_format || 'WW', sap_length || 10, auto_inc_length || 6
    ]);
    req.io.emit('config_updated');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/config/plant/:location/:plant', async (req, res) => {
  try {
    await db.query('DELETE FROM qr_config_plant WHERE location = ? AND plant = ?', [req.params.location, req.params.plant]);
    req.io.emit('config_updated');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== USERS =====
app.get('/api/users', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT email, name, role, locations, location, plant, line, `lines`, password FROM users');
    res.json({ 
      success: true, 
      users: rows.map(u => ({...u, locations: typeof u.locations === 'string' ? JSON.parse(u.locations) : u.locations, lines: typeof u.lines === 'string' ? JSON.parse(u.lines) : u.lines })) 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { email, name, password, role, locations, location, plant, line, lines } = req.body;
  try {
    const locsStr = locations ? JSON.stringify(locations) : null;
    const linesStr = lines ? JSON.stringify(lines) : null;
    await db.query(`
      INSERT INTO users (email, name, password, role, locations, location, plant, line, \`lines\`) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE name=?, password=?, role=?, locations=?, location=?, plant=?, line=?, \`lines\`=?
    `, [email, name, password, role, locsStr, location, plant, line, linesStr, name, password, role, locsStr, location, plant, line, linesStr]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/users/:email', async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE email = ?', [req.params.email]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== SAP MAPPING =====
app.get('/api/sap', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT sap_code, description FROM sap_mapping');
    res.json({ success: true, sap: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sap', async (req, res) => {
  const { sap_code, description } = req.body;
  try {
    await db.query('INSERT INTO sap_mapping (sap_code, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE description=?', [sap_code, description, description]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/sap/:sap_code', async (req, res) => {
  try {
    await db.query('DELETE FROM sap_mapping WHERE sap_code = ?', [req.params.sap_code]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== SAP REMAP =====
app.get('/api/remap', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT old_sap, new_sap FROM sap_remap');
    res.json({ success: true, remap: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/remap', async (req, res) => {
  const { old_sap, new_sap } = req.body;
  try {
    await db.query('INSERT INTO sap_remap (old_sap, new_sap) VALUES (?, ?) ON DUPLICATE KEY UPDATE new_sap=?', [old_sap, new_sap, new_sap]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/remap/:old_sap', async (req, res) => {
  try {
    await db.query('DELETE FROM sap_remap WHERE old_sap = ?', [req.params.old_sap]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== HIERARCHY =====
app.get('/api/hierarchy', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT locations, plants, `lines` FROM hierarchy WHERE id = 1');
    if (rows.length > 0) {
      res.json({ 
        success: true, 
        hierarchy: {
          locations: typeof rows[0].locations === 'string' ? JSON.parse(rows[0].locations) : rows[0].locations,
          plants: typeof rows[0].plants === 'string' ? JSON.parse(rows[0].plants) : rows[0].plants,
          lines: typeof rows[0].lines === 'string' ? JSON.parse(rows[0].lines) : rows[0].lines
        }
      });
    } else {
      res.json({ success: true, hierarchy: { locations: [], plants: {}, lines: {} } });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/hierarchy', async (req, res) => {
  const { locations, plants, lines } = req.body;
  try {
    await db.query('UPDATE hierarchy SET locations=?, plants=?, `lines`=? WHERE id = 1', 
      [JSON.stringify(locations), JSON.stringify(plants), JSON.stringify(lines)]);
    req.io.emit('hierarchy_updated');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== LOGS =====
app.get('/api/logs', async (req, res) => {
  const { limit = 50, offset = 0, plant, location, line, user, search } = req.query;
  try {
    let query = 'SELECT * FROM qr_logs WHERE 1=1';
    const params = [];
    
    if (plant) { query += ' AND plant = ?'; params.push(plant); }
    if (location) { query += ' AND location = ?'; params.push(location); }
    if (line) { query += ' AND line = ?'; params.push(line); }
    if (user) { query += ' AND user_email = ?'; params.push(user); }
    
    if (search) {
      query += ' AND (qr_code LIKE ? OR new_qr_code LIKE ? OR sap_code LIKE ? OR description LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const [rows] = await db.query(query, params);
    
    // Count total
    const [countRows] = await db.query(query.replace('SELECT *', 'SELECT COUNT(*) as c').replace(/LIMIT.*$/, ''), params.slice(0, -2));
    
    res.json({ success: true, rows, total: countRows[0].c });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/logs', async (req, res) => {
  const log = req.body;
  try {
    // 1. Duplicate check
    const [dup] = await db.query('SELECT id FROM qr_logs WHERE qr_code = ? OR new_qr_code = ? OR qr_code = ? OR new_qr_code = ?', 
      [log.qr_code, log.qr_code, log.new_qr_code, log.new_qr_code]);
      
    if (dup.length > 0) {
      return res.json({ ok: false, error: 'DUPLICATE' });
    }

    // 2. Sequence validation
    const [configRows] = await db.query('SELECT sequenceValidation FROM qr_config WHERE id = 1');
    const seqVal = configRows.length > 0 ? !!configRows[0].sequenceValidation : false;

    if (seqVal) {
      const n = parseInt(log.serial, 10);
      const [lastRows] = await db.query('SELECT serial FROM qr_logs WHERE sap_code = ? AND line = ? ORDER BY CAST(serial AS UNSIGNED) DESC LIMIT 1', [log.sap_code, log.line]);
      
      if (lastRows.length > 0) {
        const last = parseInt(lastRows[0].serial, 10);
        if (!isNaN(n) && !isNaN(last) && n !== last + 1) {
          return res.json({ 
            ok: false, 
            error: 'SEQUENCE', 
            detail: `Expected serial ${String(last + 1).padStart(log.serial.length, "0")}, got ${log.serial}` 
          });
        }
      }
    }

    // Insert
    const ts = Date.now();
    const [result] = await db.query(`
      INSERT INTO qr_logs (qr_code, new_qr_code, sap_code, old_sap_code, description, month, year, week, serial, plant, location, line, user_email, timestamp, print_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [log.qr_code, log.new_qr_code || null, log.sap_code, log.old_sap_code || null, log.description, log.month, log.year, log.week, log.serial, log.plant, log.location, log.line, log.user_email, ts, log.print_status || 'pending']);

    const finalLog = { ...log, id: result.insertId, timestamp: ts, print_status: log.print_status || 'pending' };
    req.io.emit('new_log', finalLog);
    res.json({ ok: true, log: finalLog });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/logs/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await db.query('UPDATE qr_logs SET print_status = ? WHERE id = ?', [status, req.params.id]);
    req.io.emit('log_updated', { id: parseInt(req.params.id), print_status: status });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/logs', async (req, res) => {
  try {
    await db.query('TRUNCATE TABLE qr_logs');
    req.io.emit('logs_cleared');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tsToday = todayStart.getTime();
    const tsWeek = tsToday - 6 * 86400000;

    const [totalRows] = await db.query("SELECT COUNT(*) as c FROM qr_logs WHERE print_status = 'success'");
    const [todayRows] = await db.query("SELECT COUNT(*) as c FROM qr_logs WHERE timestamp >= ? AND print_status = 'success'", [tsToday]);
    const [weekRows] = await db.query("SELECT COUNT(*) as c FROM qr_logs WHERE timestamp >= ? AND print_status = 'success'", [tsWeek]);
    
    const [lineRows] = await db.query("SELECT line as `key`, COUNT(*) as count FROM qr_logs WHERE print_status = 'success' GROUP BY line");
    const [userRows] = await db.query("SELECT user_email as `key`, COUNT(*) as count FROM qr_logs WHERE print_status = 'success' GROUP BY user_email");
    const [plantRows] = await db.query("SELECT plant as `key`, COUNT(*) as count FROM qr_logs WHERE print_status = 'success' GROUP BY plant");
    const [locRows] = await db.query("SELECT location as `key`, COUNT(*) as count FROM qr_logs WHERE print_status = 'success' GROUP BY location");

    res.json({
      success: true,
      stats: {
        total: totalRows[0].c,
        today: todayRows[0].c,
        week: weekRows[0].c,
        byLine: lineRows,
        byUser: userRows,
        byPlant: plantRows,
        byLocation: locRows
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== DATABASE EXPLORER =====
app.get('/api/db/tables', async (req, res) => {
  try {
    const [rows] = await db.query('SHOW TABLES');
    const tables = rows.map(r => Object.values(r)[0]);
    res.json({ success: true, tables });
  } catch(e) { res.status(500).json({error: e.message}) }
});

app.get('/api/db/data/:table', async (req, res) => {
  try {
    const table = req.params.table;
    if (!/^[a-zA-Z0-9_]+$/.test(table)) return res.status(400).json({error: 'Invalid table name'});
    
    const [cols] = await db.query(`SHOW COLUMNS FROM ??`, [table]);
    const pk = cols.find(c => c.Key === 'PRI')?.Field || cols[0].Field;
    
    // Order by primary key descending to show newest first, limit 200 to prevent huge payloads
    const [rows] = await db.query(`SELECT * FROM ?? ORDER BY ?? DESC LIMIT 200`, [table, pk]);
    res.json({ success: true, rows, pk, cols: cols.map(c => c.Field) });
  } catch(e) { res.status(500).json({error: e.message}) }
});

app.delete('/api/db/data/:table/:pkField/:pkValue', async (req, res) => {
  try {
    const { table, pkField, pkValue } = req.params;
    if (!/^[a-zA-Z0-9_]+$/.test(table) || !/^[a-zA-Z0-9_]+$/.test(pkField)) {
      return res.status(400).json({error: 'Invalid identifiers'});
    }
    
    // For composite keys like qr_config_plant, we'll try our best or the user should delete them in Settings
    // But for single-key tables this works perfectly
    await db.query(`DELETE FROM ?? WHERE ?? = ?`, [table, pkField, pkValue]);
    
    if (table === 'qr_logs') req.io.emit('logs_cleared');
    
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}) }
});

// Bartender Integration
app.use('/api/bartender', bartenderRoutes);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Backend server running on port ${PORT}`);
});
