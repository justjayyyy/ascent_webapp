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

export function serverError(res, err) {
  console.error('Server error:', err);
  console.error('Error stack:', err.stack);
  console.error('Error code:', err.code);
  console.error('Error message:', err.message);
  
  // Provide more helpful error messages for common issues
  if (err.code === 'MONGODB_CONNECTION_FAILED' || 
      err.message?.includes('ECONNREFUSED') ||
      err.message?.includes('Cannot connect to MongoDB') ||
      err.message?.includes('querySrv')) {
    return error(res, err.message || 'Database connection failed. Please check your internet connection and MongoDB settings.', 503);
  }
  
  // Always show error message in development (default for local)
  const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
  if (isDevelopment) {
    return error(res, err.message || 'Internal server error', 500);
  }
  
  return error(res, 'Internal server error', 500);
}

