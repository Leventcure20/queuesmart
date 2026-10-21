const express = require('express');
const authRoutes = require('./modules/auth/auth.routes');
const serviceRoutes = require('./modules/services/services.routes');
const queueRoutes = require('./modules/queue/queue.routes');
const errorHandler = require('./middleware/error-handler');

const app = express();

const frontendOrigins = new Set([
  'http://localhost:8000',
  'http://127.0.0.1:8000',
]);

app.use((req, res, next) => {
  const origin = req.get('origin');
  if (frontendOrigins.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/queue', queueRoutes);
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use(errorHandler);

module.exports = app;
