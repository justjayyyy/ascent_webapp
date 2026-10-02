import { reportError } from './monitoring.js';

// Standard API response helpers
export function success(res, data, statusCode = 200) {
  // Ensure data is serializable (already handled by lean() in queries)
  // But handle edge cases where documents might not be lean
  let serializableData = data;

  if (Array.isArray(data)) {
    serializableData = data.map(item => {
      if (item && typeof item === 'object') {
        if (item.toJSON) {
          return item.toJSON();
        }
        // Ensure _id is converted to id if needed
        if (item._id && !item.id) {
          return { ...item, id: item._id.toString() };
        }
      }
      return item;
    });
  } else if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (data.toJSON) {
      serializableData = data.toJSON();
    }
    // Ensure _id is converted to id if needed
    if (serializableData._id && !serializableData.id) {
      serializableData = { ...serializableData, id: serializableData._id.toString() };
    }
  }

  return res.status(statusCode).json({
    success: true,
    data: serializableData
  });
}

export function error(res, message, statusCode = 400) {
  return res.status(statusCode).json({
    success: false,
    error: message
  });
}

export function notFound(res, message = 'Resource not found') {
  return error(res, message, 404);
}

export function unauthorized(res, message = 'Unauthorized') {
  return error(res, message, 401);
}

export function forbidden(res, message = 'Forbidden') {
  return error(res, message, 403);
}

/**
 * An unexpected failure: logged, reported to Sentry when it is set up (before answering, since a
 * serverless function may stop once the response is out), and answered without details in production.
 */
export async function serverError(res, err) {
  const req = res.req;
  console.error(`[API] ${req ? `${req.method} ${req.path} ` : ''}failed:`, err?.code || '', err?.message);

  // The database being unreachable is not a bug to report, and the caller can try again
  if (err?.code === 'MONGODB_CONNECTION_FAILED' || err?.code === 'MONGODB_AUTH_FAILED') {
    return error(res, 'Database connection failed', 503);
  }

  await reportError(err, { req });
  const isDevelopment = process.env.NODE_ENV === 'development';
  return error(res, isDevelopment ? (err?.message || 'Internal server error') : 'Internal server error', 500);
}

