const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');

const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    const decoded = jwt.verify(token, jwtConfig.secret);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required',
    });
  }
  next();
};

const verifyRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: insufficient permissions',
      });
    }
    next();
  };
};

const verifyAppRole = (appRoles, options = {}) => {
  const allowAdmin = options.allowAdmin !== false;

  return (req, res, next) => {
    if (allowAdmin && req.user.role === 'admin') {
      return next();
    }

    if (!req.user.appRole || !appRoles.includes(req.user.appRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: invalid application role',
      });
    }

    next();
  };
};

const verifyRoleOrAppRole = ({ roles = [], appRoles = [], allowAdmin = true } = {}) => {
  return (req, res, next) => {
    if (allowAdmin && req.user.role === 'admin') {
      return next();
    }

    const hasSystemRole =
      Array.isArray(roles) && roles.includes(req.user.role);
    const hasAppRole =
      Array.isArray(appRoles)
      && req.user.appRole
      && appRoles.includes(req.user.appRole);

    if (!hasSystemRole && !hasAppRole) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: insufficient permissions',
      });
    }

    next();
  };
};

module.exports = {
  authenticate,
  verifyToken: authenticate,
  requireAdmin,
  verifyAdmin: requireAdmin,
  verifyRole,
  verifyAppRole,
  verifyRoleOrAppRole,
};
