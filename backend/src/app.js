const express = require('express');
const authRoutes = require('./modules/auth/auth.routes');
const serviceRoutes = require('./modules/services/services.routes');
const errorHandler = require('./middleware/error-handler');

const app = express();

app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use(errorHandler);

module.exports = app;
