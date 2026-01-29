import connectDB from './mongodb.js';
import { handleCors } from './cors.js';
import { success, error, notFound, serverError } from './response.js';
import { authMiddleware } from '../middleware/auth.js';

// Generic CRUD handler for entities
export function createEntityHandler(Model, options = {}) {
  const { 
    allowPublic = false,
    filterByUser = true,
    userField = 'created_by',
    checkSharing = false
  } = options;

  return async function handler(req, res) {
    const entityName = Model.modelName || 'Entity';
    
    if (handleCors(req, res)) return;
    
    try {
      const user = await authMiddleware(req, res);
      if (!user) return;
      
      const { method } = req;
      
      // Connect to MongoDB
      try {
        await connectDB();
      } catch (dbError) {
        if (process.env.NODE_ENV === 'development') {
          console.error(`[EntityHandler] MongoDB connection failed for ${entityName}:`, dbError.message);
        }
        return serverError(res, dbError);
      }

      const { id, _single } = req.query;

      // Helper function to build user filter (workspace-based)
      const buildUserFilter = async () => {
        if (!filterByUser || !user) return {};
        
        // If workspace context is available (set by authMiddleware)
        if (req.workspace) {
          const baseFilter = { workspaceId: req.workspace._id };
          
          // If checkSharing is enabled and user is not the workspace owner
          if (checkSharing && req.workspace.ownerId && req.workspace.ownerId.toString() !== user._id.toString()) {
            return {
              ...baseFilter,
              $or: [
                { createdBy: user._id },
                { isShared: true }
              ]
            };
          }
          
          return baseFilter;
        }
        
        // Fallback or no workspace context (should ideally not happen if enforced)
        return {};
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

          // Build query from filters
          let query = await buildUserFilter();
            
          // Add additional filters from query params
          for (const [key, value] of Object.entries(filters)) {
            // IGNORE 'path' - it might be injected by the router
            if (!['sort', 'limit', '_single', 'path'].includes(key) && value !== undefined && value !== null) {
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
          
          if (!req.workspace) {
             return error(res, 'Workspace context required', 400);
          }
          
          // Check for bulk create
          if (Array.isArray(req.body)) {
            const itemsToCreate = req.body.map(item => ({
              ...item,
              workspaceId: req.workspace._id,
              createdBy: user._id
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
          const itemData = {
            ...req.body,
            workspaceId: req.workspace._id,
            createdBy: user._id
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
                return error(res, 'You do not have permission to update this item', 403);
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
                return error(res, 'You do not have permission to delete this item', 403);
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
      // Always log the error
      console.error(`[EntityHandler] ${req.method} ${entityName} ERROR:`, err);
      return serverError(res, err);
    }
  };
}

// Helper to handle bulk operations
export async function bulkCreate(Model, items, workspaceId, userId) {
  const itemsToCreate = items.map(item => ({
    ...item,
    workspaceId,
    createdBy: userId
  }));
  return Model.insertMany(itemsToCreate);
}

export async function bulkDelete(Model, filter) {
  return Model.deleteMany(filter);
}

