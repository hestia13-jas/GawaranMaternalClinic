const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();

router.get('/', verifyToken, requireRole('admin'), async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Database not configured.' });
  }

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { data, error } = await supabaseAdmin
    .from('audit_logs')
    .select('id, user_id, action, details, ip_address, created_at, profiles(first_name, last_name, email)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ logs: data });
});

module.exports = router;
