require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const moduleRoutes = require('./routes/modules');
const auditRoutes = require('./routes/audit');

const app = express();
const PORT = process.env.PORT || 3000;
const csrfTokens = new Set();

app.set('trust proxy', 1);

app.use((req, res, next) => {
  const forceHttps = process.env.FORCE_HTTPS === 'true';
  const forwardedProto = req.get('x-forwarded-proto');
  if (forceHttps && !req.secure && forwardedProto !== 'https') {
    return res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
  }
  return next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''],
      },
    },
  })
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/api/auth/login') || req.path.startsWith('/api/auth/register') || req.path.startsWith('/api/auth/forgot-password')) {
    return next();
  }
  const token = req.get('x-csrf-token');
  if (!token || !csrfTokens.has(token)) {
    return res.status(403).json({ error: 'Security check failed. Please refresh the page and try again.' });
  }
  return next();
});
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid request format. Please check the form and try again.' });
  }
  return next(err);
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api/auth', authLimiter);

app.get('/api/config', (req, res) => {
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  csrfTokens.add(csrfToken);
  setTimeout(() => csrfTokens.delete(csrfToken), 12 * 60 * 60 * 1000).unref?.();
  res.json({
    supabaseUrl: process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
    appUrl: process.env.APP_URL || `http://localhost:${PORT}`,
    maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    lockoutMinutes: Number(process.env.LOCKOUT_MINUTES) || 15,
    csrfToken,
    inactivityMinutes: Number(process.env.INACTIVITY_MINUTES) || 30,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api', moduleRoutes);
app.use('/api/audit', auditRoutes);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/dashboard/:role', (req, res) => {
  res.redirect(302, '/portal.html');
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Gawaran Maternal Clinic running at http://localhost:${PORT}`);
});
