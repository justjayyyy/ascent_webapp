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
  return error(res, 'Internal server error', 500);
}

