// Input validation helpers
import { error } from './response.js';

// Sanitize string input
export function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str
    .trim()
    .replace(/[<>]/g, '') // Remove potential XSS chars
    .slice(0, 10000);     // Limit length
}

// Sanitize object recursively
export function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitize(obj);
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[sanitize(key)] = sanitizeObject(value);
  }
  return result;
}

// Email validation
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof email === 'string' && emailRegex.test(email);
}

// Password validation
export function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6;
}

// MongoDB ObjectId validation
export function isValidObjectId(id) {
  return typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
}

// Validate required fields
export function validateRequired(res, data, fields) {
  const missing = fields.filter(field => {
    const value = data[field];
    return value === undefined || value === null || value === '';
  });
  
  if (missing.length > 0) {
    error(res, `Missing required fields: ${missing.join(', ')}`, 400);
    return false;
  }
  return true;
}

// Validate numeric range
export function validateNumber(value, min = -Infinity, max = Infinity) {
  const num = Number(value);
  return !isNaN(num) && num >= min && num <= max;
}

// Validate enum value
export function validateEnum(value, allowedValues) {
  return allowedValues.includes(value);
}

// Validation schema runner
export function validate(res, data, schema) {
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    
    // Required check
    if (rules.required && (value === undefined || value === null || value === '')) {
      error(res, `${field} is required`, 400);
      return false;
    }
    
    // Skip further validation if field is not present and not required
    if (value === undefined || value === null) continue;
    
    // Type check
    if (rules.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== rules.type) {
        error(res, `${field} must be a ${rules.type}`, 400);
        return false;
      }
    }
    
    // Email check
    if (rules.email && !isValidEmail(value)) {
      error(res, `${field} must be a valid email`, 400);
      return false;
    }
    
    // Min length
    if (rules.minLength && (typeof value !== 'string' || value.length < rules.minLength)) {
      error(res, `${field} must be at least ${rules.minLength} characters`, 400);
      return false;
    }
    
    // Max length
    if (rules.maxLength && (typeof value !== 'string' || value.length > rules.maxLength)) {
      error(res, `${field} must be at most ${rules.maxLength} characters`, 400);
      return false;
    }
    
    // Enum check
    if (rules.enum && !rules.enum.includes(value)) {
      error(res, `${field} must be one of: ${rules.enum.join(', ')}`, 400);
      return false;
    }
    
    // Min value
    if (rules.min !== undefined && value < rules.min) {
      error(res, `${field} must be at least ${rules.min}`, 400);
      return false;
    }
    
    // Max value
    if (rules.max !== undefined && value > rules.max) {
      error(res, `${field} must be at most ${rules.max}`, 400);
      return false;
    }
  }
  
  return true;
}

export default { sanitize, sanitizeObject, isValidEmail, isValidPassword, isValidObjectId, validateRequired, validate };

