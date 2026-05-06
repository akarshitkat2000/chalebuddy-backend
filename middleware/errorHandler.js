const logger = require("../utils/logger");

// Convert known Mongoose / JWT errors to friendly messages
const handleCastError       = (e) => ({ status: 400, message: `Invalid ${e.path}: ${e.value}` });
const handleDuplicateFields = (e) => ({ status: 409, message: `Duplicate value for: ${Object.keys(e.keyValue).join(", ")}` });
const handleValidationError = (e) => ({ status: 400, message: Object.values(e.errors).map((v) => v.message).join(". ") });
const handleJWTError        = ()  => ({ status: 401, message: "Invalid token. Please log in again." });
const handleJWTExpired      = ()  => ({ status: 401, message: "Your session has expired. Please log in again." });

module.exports = (err, req, res, next) => {
  let { statusCode = 500, message = "Internal Server Error", isOperational } = err;

  if (err.name === "CastError")          ({ status: statusCode, message } = handleCastError(err));
  if (err.code === 11000)                ({ status: statusCode, message } = handleDuplicateFields(err));
  if (err.name === "ValidationError")    ({ status: statusCode, message } = handleValidationError(err));
  if (err.name === "JsonWebTokenError")  ({ status: statusCode, message } = handleJWTError());
  if (err.name === "TokenExpiredError")  ({ status: statusCode, message } = handleJWTExpired());

  if (process.env.NODE_ENV === "development") {
    logger.error(`${req.method} ${req.originalUrl} → ${statusCode}: ${message}`);
    return res.status(statusCode).json({ status: "error", statusCode, message, stack: err.stack });
  }

  // Production: don't leak internals
  if (!isOperational) {
    logger.error(`UNHANDLED ERROR: ${err.message}`, { stack: err.stack });
    return res.status(500).json({ status: "error", message: "Something went wrong. Please try again." });
  }

  res.status(statusCode).json({ status: "error", message });
};
