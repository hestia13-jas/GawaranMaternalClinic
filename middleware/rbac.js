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
  return DASHBOARD_BY_ROLE[role] || '/dashboard/patient';
}

function requireRole(...roles) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action.' });
    }
    next();
  };
}

module.exports = { canAccess, getDashboardPath, requireRole, DASHBOARD_BY_ROLE };
