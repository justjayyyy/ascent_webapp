import connectDB from './mongodb.js';
import { handleCors } from './cors.js';
import { success, error, notFound, forbidden, serverError } from './response.js';
import { authMiddleware } from '../middleware/auth.js';

const NEVER_FILTER = new Set(['workspaceId', 'createdBy', '_id', 'sort', 'limit', '_single', 'path']);
const NEVER_WRITE = new Set(['workspaceId', 'createdBy', '_id', 'id']);

// Owners and admins may do anything in their workspace; everyone else needs the named member permission.
export function memberMay(req, user, permission) {
  if (!permission) return true;
  const member = req.member;
  if (!member) return false;
  if (member.role === 'owner' || member.role === 'admin') return true;
  if (req.workspace?.ownerId && req.workspace.ownerId.toString() === user._id.toString()) return true;
  return member.permissions?.[permission] === true;
}

// Only plain values for real schema fields become filters: no operators, no tenant fields.
function safeFilters(Model, filters) {
  const out = {};
  for (const [key, value] of Object.entries(filters)) {
    if (NEVER_FILTER.has(key) || key.startsWith('$') || key.includes('.')) continue;
    if (typeof value !== 'string' || !Model.schema?.path(key)) continue;
    out[key] = value;
  }
  return out;
}

const safeBody = (body) =>
  Object.fromEntries(Object.entries(body).filter(([k]) => !NEVER_WRITE.has(k) && !k.startsWith('$')));

// Rows queued on a device while offline carry an "app:<uuid>" dedupeKey, so a retried upload finds the
// row the first attempt already stored instead of adding it twice. Other keys belong to automation
// (Wallet, SMS, statements) and a client may not set them.
const APP_KEY = /^app:[\w-]{8,100}(:\d{1,4})?$/; // ":n" numbers the rows of one queued batch
function appKeyed(Model, item) {
  if (!Model.schema?.path?.('dedupeKey') || !item || typeof item !== 'object') return item;
  if (item.dedupeKey === undefined) return item;
  if (typeof item.dedupeKey === 'string' && APP_KEY.test(item.dedupeKey)) return item;
  const { dedupeKey, ...rest } = item;
  return rest;
}
const isDuplicate = (err) => err?.code === 11000 || err?.writeErrors?.some?.((e) => e.code === 11000 || e.err?.code === 11000);
const withId = (doc) => (doc && !doc.id && doc._id ? { ...doc, id: doc._id.toString() } : doc);

// Generic CRUD handler for entities
// options.permission: { read, write } member permission names (see the Workspace model), e.g. { read: 'viewExpenses', write: 'editExpenses' }
export function createEntityHandler(Model, options = {}) {
  const { 
    allowPublic = false,
    filterByUser = true,
    userField = 'created_by',
    checkSharing = false,
    permission = null
  } = options;

  return async function handler(req, res) {
    const entityName = Model.modelName || 'Entity';
    
    if (handleCors(req, res)) return;
    
    try {
      const user = await authMiddleware(req, res);
      if (!user) return;
      
      const { method } = req;

      // Every request is scoped to a workspace the caller belongs to; auth sets req.workspace only for members.
      if (!req.workspace) {
        return req.headers['x-workspace-id']
          ? forbidden(res, 'Not a member of this workspace')
          : error(res, 'Workspace context required', 400);
      }
      const needed = permission ? (method === 'GET' ? permission.read : permission.write) : null;
      if (!memberMay(req, user, needed)) return forbidden(res, 'You do not have permission for this action');
      
      // Connect to MongoDB
      try {
        await connectDB();
      } catch (dbError) {
        if (process.env.NODE_ENV === 'development') {
          console.error(`[EntityHandler] MongoDB connection failed for ${entityName}:`, dbError.message);
        }
        return serverError(res, dbError);
      }

      const { _single } = req.query;
      const id = typeof req.query.id === 'string' ? req.query.id : undefined;

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
            
          // Add client filters: real fields, plain values only, never the tenant scope
          Object.assign(query, safeFilters(Model, filters));
          if (id) query._id = id;

          // Parse sort - MongoDB accepts string format like "-created_date"
          const sortField = typeof sort === 'string' && /^-?[A-Za-z_]+$/.test(sort) ? sort : '-created_date';
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
              ...appKeyed(Model, item),
              workspaceId: req.workspace._id,
              createdBy: user._id
            }));
            const toJson = (item) => {
              const itemObj = item.toJSON ? item.toJSON() : item;
              if (!itemObj.id && itemObj._id) itemObj.id = itemObj._id.toString();
              return itemObj;
            };
            try {
              const items = await Model.insertMany(itemsToCreate);
              return success(res, items.map(toJson), 201);
            } catch (createError) {
              // A retried offline upload: return what is already stored and add only what is missing
              const keys = itemsToCreate.map((i) => i.dedupeKey).filter((k) => typeof k === 'string');
              if (isDuplicate(createError) && keys.length === itemsToCreate.length) {
                try {
                  const stored = await Model.find({ workspaceId: req.workspace._id, dedupeKey: { $in: keys } }).lean();
                  const have = new Set(stored.map((d) => d.dedupeKey));
                  const missing = itemsToCreate.filter((i) => !have.has(i.dedupeKey));
                  const added = missing.length ? await Model.insertMany(missing) : [];
                  const byKey = new Map([...stored.map(withId), ...added.map(toJson)].map((d) => [d.dedupeKey, d]));
                  return success(res, keys.map((k) => byKey.get(k)).filter(Boolean), 200);
                } catch (retryError) {
                  return serverError(res, retryError);
                }
              }
              if (createError.name === 'ValidationError') {
                const validationErrors = Object.values(createError.errors || {}).map(err => err.message).join(', ');
                return error(res, `Validation error: ${validationErrors}`, 400);
              }
              return serverError(res, createError);
            }
          }

          // Single create
          const itemData = {
            ...appKeyed(Model, req.body),
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
            // A retried offline upload whose first attempt got through: answer with that row
            if (isDuplicate(createError) && typeof itemData.dedupeKey === 'string') {
              const stored = await Model.findOne({ workspaceId: req.workspace._id, dedupeKey: itemData.dedupeKey }).lean();
              if (stored) return success(res, withId(stored), 200);
            }
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
              safeBody(req.body),
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

