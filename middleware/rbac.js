const { normalizeRole, roleForRequest } = require('../lib/profile');

const ROLE_HIERARCHY = {
  admin: ['admin', 'doctor', 'nurse', 'staff', 'patient'],
  doctor: ['doctor', 'patient'],
  nurse: ['nurse', 'patient'],
  staff: ['staff', 'patient'],
  patient: ['patient'],
};

const DASHBOARD_BY_ROLE = {
  admin: '/portal.html',
  doctor: '/portal.html',
  nurse: '/portal.html',
  staff: '/portal.html',
  patient: '/portal.html',
};

function canAccess(actorRole, targetRole) {
  const allowed = ROLE_HIERARCHY[actorRole];
  return allowed ? allowed.includes(targetRole) : false;
}

function getDashboardPath(role) {
  return DASHBOARD_BY_ROLE[role] || '/portal.html';
}

function effectiveRole(user) {
  return roleForRequest(user, user?.email);
}

function requireRole(...roles) {
  const allowed = new Set(roles.map((role) => normalizeRole(role)).filter(Boolean));
  return (req, res, next) => {
    const userRole = effectiveRole(req.user);
    req.user.role = userRole;
    if (!allowed.has(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action.' });
    }
    next();
  };
}

module.exports = { canAccess, getDashboardPath, requireRole, effectiveRole, DASHBOARD_BY_ROLE };
