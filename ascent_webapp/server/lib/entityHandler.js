import connectDB from './mongodb.js';
import { handleCors } from './cors.js';
import { success, error, notFound, serverError } from './response.js';
import { authMiddleware } from '../middleware/auth.js';
import SharedUser from '../models/SharedUser.js';

// Generic CRUD handler for entities
export function createEntityHandler(Model, options = {}) {
  const { 
    allowPublic = false,
    filterByUser = true,
    userField = 'created_by'
  } = options;

  return async function handler(req, res) {
    const entityName = Model.modelName || 'Entity';
    
    if (handleCors(req, res)) return;
    
    try {
      const user = await authMiddleware(req, res);
      if (!user) return;

      // Connect to MongoDB
      try {
        await connectDB();
      } catch (dbError) {
        if (process.env.NODE_ENV === 'development') {
          console.error(`[EntityHandler] MongoDB connection failed for ${entityName}:`, dbError.message);
        }
        return serverError(res, dbError);
      }

      const { method } = req;
      const { id, _single } = req.query;

      // Helper function to get the effective owner email (for shared users, use owner's email)
      const getEffectiveOwnerEmail = async () => {
        if (!user || !user.email) return null;
        
        const userEmail = user.email.trim().toLowerCase();
        
        // Skip SharedUser lookup if we're already working with SharedUser model
        // to avoid circular dependency issues
        if (Model.modelName === 'SharedUser') {
          return userEmail;
        }
        
        try {
          if (!SharedUser) {
            return userEmail;
          }
          
          // Check if user is a shared user (invited by someone)
          // Use case-insensitive regex matching to be safe
          const sharedUserRecord = await SharedUser.findOne({
            $or: [
              { invitedEmail: userEmail },
              { invitedEmail: { $regex: `^${userEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }
            ],
            status: 'accepted'
          }).lean();
          
          if (sharedUserRecord && sharedUserRecord.created_by) {
            // User is a shared user - return the owner's email (created_by)
            const ownerEmail = sharedUserRecord.created_by.trim().toLowerCase();
            if (process.env.NODE_ENV === 'development') {
              console.log(`[EntityHandler] Shared user detected: ${userEmail} -> Owner: ${ownerEmail}`);
            }
            return ownerEmail;
          }
        } catch (error) {
          // If there's an error checking shared user, fall back to user's own email
          console.error('[EntityHandler] Error checking shared user:', error.message);
        }
        
        // User is the owner - return their own email
        return userEmail;
      };

      // Helper function to build user filter (case-insensitive)
      const buildUserFilter = async () => {
        if (!filterByUser || !user || !user.email) return {};
        
        try {
          // Get the effective owner email (owner's email for shared users, own email for owners)
          const effectiveEmail = await getEffectiveOwnerEmail();
          if (!effectiveEmail) return {};
          
          const userEmail = user.email.trim().toLowerCase();
          const isSharedUser = effectiveEmail !== userEmail;
          
          if (process.env.NODE_ENV === 'development' && isSharedUser) {
            console.log(`[EntityHandler] Building filter for shared user ${userEmail} -> Owner: ${effectiveEmail}`);
          }
          
          const escapedEmail = effectiveEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          // Use case-insensitive regex matching AND try exact lowercase match
          return {
            $or: [
              { [userField]: { $regex: `^${escapedEmail}$`, $options: 'i' } },
              { [userField]: effectiveEmail }
            ]
          };
        } catch (error) {
          // Fallback to user's own email if there's an error (but log it)
          console.error('[EntityHandler] Error building user filter:', error.message);
          const userEmail = user.email.trim().toLowerCase();
          const escapedEmail = userEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return {
            $or: [
              { [userField]: { $regex: `^${escapedEmail}$`, $options: 'i' } },
              { [userField]: userEmail }
            ]
          };
        }
      };

      switch (method) {
        case 'GET': {
          // Single item lookup - ONLY when _single=true is explicitly passed
          if (_single === 'true' && id) {
            const userFilter = await buildUserFilter();
            const query = { _id: id, ...userFilter };
            
            const item = await Model.findOne(query).lean();
            
            if (!item) {
              return notFound(res, 'Item not found');
            }
            
            // Ensure id field exists
            if (!item.id && item._id) {
              item.id = item._id.toString();
            }
            
            return success(res, item);
          }

          // Get list with filters (always returns array)
          const { 
            sort = '-created_date', 
            limit = 1000,
            ...filters 
          } = req.query;

          // Build query from filters (case insensitive email matching)
          let query = await buildUserFilter();
            
          // Add additional filters from query params
          for (const [key, value] of Object.entries(filters)) {
            if (!['sort', 'limit', '_single'].includes(key) && value !== undefined && value !== null) {
              // Map 'id' to '_id' for MongoDB
              const queryKey = key === 'id' ? '_id' : key;
              query[queryKey] = value;
            }
          }

          // Parse sort - MongoDB accepts string format like "-created_date"
          const sortField = sort || '-created_date';
          const limitValue = Math.min(parseInt(limit) || 1000, 10000); // Cap at 10k
          
          // Try main query first
          let items = await Model.find(query)
            .sort(sortField)
            .limit(limitValue)
            .lean();

          // Don't fallback to user's own email - if they're a shared user, 
          // we want to show owner's data (even if empty), not their own empty data
          // The query already uses the effective owner email, so if it returns 0 items,
          // that means the owner has no data, which is correct

          // Ensure all items have id field
          const itemsArray = items.map(item => {
            if (!item.id && item._id) {
              item.id = item._id.toString();
            }
            return item;
          });

          return success(res, itemsArray);
        }

        case 'POST': {
          if (!req.body || (typeof req.body === 'object' && Object.keys(req.body).length === 0 && !Array.isArray(req.body))) {
            return error(res, 'Request body is required', 400);
          }
          
          // Normalize user email to ensure consistency (lowercase, trimmed)
          const normalizedEmail = user.email.trim().toLowerCase();
          
          // Get effective owner email (for shared users, use owner's email)
          let effectiveEmailForCreate = normalizedEmail;
          try {
            effectiveEmailForCreate = await getEffectiveOwnerEmail() || normalizedEmail;
          } catch (error) {
            console.error('[EntityHandler] Error getting effective email for create:', error.message);
            effectiveEmailForCreate = normalizedEmail;
          }
          
          // Check for bulk create
          if (Array.isArray(req.body)) {
            const itemsToCreate = req.body.map(item => ({
              ...item,
              [userField]: effectiveEmailForCreate
            }));
            try {
              const items = await Model.insertMany(itemsToCreate);
              return success(res, items.map(item => {
                const itemObj = item.toJSON ? item.toJSON() : item;
                if (!itemObj.id && itemObj._id) itemObj.id = itemObj._id.toString();
                return itemObj;
              }), 201);
            } catch (createError) {
              if (createError.name === 'ValidationError') {
                const validationErrors = Object.values(createError.errors || {}).map(err => err.message).join(', ');
                return error(res, `Validation error: ${validationErrors}`, 400);
              }
              return serverError(res, createError);
            }
          }

          // Single create
          // For shared users, use owner's email; for owners, use their own email
          const itemData = {
            ...req.body,
            [userField]: effectiveEmailForCreate
          };
          
          try {
            const item = await Model.create(itemData);
            
            // Convert to JSON to ensure virtuals are included
            let itemJson;
            if (item.toJSON) {
              itemJson = item.toJSON();
            } else if (item.toObject) {
              itemJson = item.toObject({ virtuals: true });
            } else {
              itemJson = item;
            }
            
            // Ensure id field exists
            if (!itemJson.id && itemJson._id) {
              itemJson.id = itemJson._id.toString();
            }
            
            return success(res, itemJson, 201);
          } catch (createError) {
            if (createError.name === 'ValidationError') {
              const validationErrors = Object.values(createError.errors || {}).map(err => err.message).join(', ');
              return error(res, `Validation error: ${validationErrors}`, 400);
            }
            return serverError(res, createError);
          }
        }

        case 'PUT':
        case 'PATCH': {
          if (!id) {
            return error(res, 'ID is required for update. Provide ?id=... in URL', 400);
          }

          if (!req.body || Object.keys(req.body).length === 0) {
            return error(res, 'Update data is required in request body', 400);
          }

          const userFilter = await buildUserFilter();
          const updateQuery = { _id: id, ...userFilter };

          try {
            const item = await Model.findOneAndUpdate(
              updateQuery,
              req.body,
              { new: true, runValidators: true }
            ).lean();

            if (!item) {
              const exists = await Model.findById(id).lean();
              if (exists) {
                return forbidden(res, 'You do not have permission to update this item');
              }
              return notFound(res, 'Item not found');
            }

            if (!item.id && item._id) {
              item.id = item._id.toString();
            }

            return success(res, item);
          } catch (updateError) {
            if (updateError.name === 'ValidationError') {
              const validationErrors = Object.values(updateError.errors || {}).map(err => err.message).join(', ');
              return error(res, `Validation error: ${validationErrors}`, 400);
            }
            return serverError(res, updateError);
          }
        }

        case 'DELETE': {
          if (!id) {
            return error(res, 'ID is required for delete. Provide ?id=... in URL', 400);
          }

          const userFilter = await buildUserFilter();
          const deleteQuery = { _id: id, ...userFilter };

          try {
            const item = await Model.findOneAndDelete(deleteQuery).lean();

            if (!item) {
              const exists = await Model.findById(id).lean();
              if (exists) {
                return forbidden(res, 'You do not have permission to delete this item');
              }
              return notFound(res, 'Item not found');
            }

            return success(res, { deleted: true, id: item._id || item.id });
          } catch (deleteError) {
            return serverError(res, deleteError);
          }
        }

        default:
          return error(res, 'Method not allowed', 405);
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`[EntityHandler] ${req.method} ${entityName}:`, err.message);
      }
      return serverError(res, err);
    }
  };
}

// Helper to handle bulk operations
export async function bulkCreate(Model, items, userEmail, userField = 'created_by') {
  const itemsToCreate = items.map(item => ({
    ...item,
    [userField]: userEmail
  }));
  return Model.insertMany(itemsToCreate);
}

export async function bulkDelete(Model, filter) {
  return Model.deleteMany(filter);
}

