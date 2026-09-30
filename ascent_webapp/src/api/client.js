// Ascent API Client - Replaces base44 client
const API_URL = import.meta.env.VITE_API_URL || '/api';
const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 2;

// Token management
const TOKEN_KEY = 'ascent_access_token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// HTTP request helper with timeout and retry
async function request(endpoint, options = {}, retryCount = 0) {
  const token = getToken();
  
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...options.headers
  };
  
  // Ensure Content-Type is set if body exists
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const currentWorkspaceId = localStorage.getItem('ascent_current_workspace_id');
  if (currentWorkspaceId) {
    headers['x-workspace-id'] = currentWorkspaceId;
  }
  
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  
  try {
    const url = `${API_URL}${endpoint}`;
    // Only log in development
    if (import.meta.env.DEV) {
      console.log(`[API] Making request to: ${url}`, { method: options.method || 'GET', headers });
    }
    
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    // Only log in development
    if (import.meta.env.DEV) {
      console.log(`[API] Response status: ${response.status} ${response.statusText}`, { url, contentType: response.headers.get('content-type') });
    }
    
    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || 60;
      const error = new Error('Too many requests. Please try again later.');
      error.status = 429;
      error.retryAfter = retryAfter;
      throw error;
    }
    
    // Check content type before parsing JSON
    const contentType = response.headers.get('content-type');
    let data;
    
    try {
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        // If not JSON, try to get text for error message
        const text = await response.text();
        const error = new Error(`Server returned non-JSON response: ${text.substring(0, 100)}`);
        error.status = response.status;
        error.responseText = text;
        throw error;
      }
    } catch (parseError) {
      // If JSON parsing fails, provide helpful error
      if (parseError.responseText) {
        throw parseError; // Re-throw our custom error
      }
      const error = new Error(`Failed to parse server response: ${parseError.message}`);
      error.status = response.status;
      error.originalError = parseError;
      throw error;
    }
    
    // The account was signed in on another device (or the token predates single-session): drop
    // this device's token and send the user to sign in again.
    if (response.status === 401 && (data.code === 'SESSION_REPLACED' || data.code === 'SESSION_INVALID')) {
      removeToken();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        const reason = data.code === 'SESSION_REPLACED' ? 'session_replaced' : 'session_expired';
        window.location.href = `/login?reason=${reason}`;
      }
    }

    if (!response.ok) {
      const error = new Error(data.error || `Request failed with status ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    
    // Ensure data.data exists
    if (!data || typeof data !== 'object' || !('data' in data)) {
      console.error('[API] Invalid response format:', { data, expected: 'data.data' });
      const error = new Error('Invalid server response format');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    
    return data.data;
  } catch (err) {
    clearTimeout(timeoutId);
    
    // Handle timeout
    if (err.name === 'AbortError') {
      const error = new Error('Request timed out. Please check if the API server is running.');
      error.status = 408;
      throw error;
    }
    
    // Handle network errors (connection refused, etc.)
    if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('ERR_CONNECTION_REFUSED'))) {
      const error = new Error('Cannot connect to server. Please ensure the API server is running on port 3002.');
      error.status = 0;
      error.isNetworkError = true;
      throw error;
    }
    
    // Retry on network errors (not on 4xx errors)
    const isRetryable = !err.status || err.status >= 500;
    if (isRetryable && retryCount < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
      return request(endpoint, options, retryCount + 1);
    }
    
    throw err;
  }
}

// Auth methods
const auth = {
  async login(email, password) {
    try {
      const result = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (!result || !result.token) {
        throw new Error('Invalid response: missing token');
      }
      if (!result.user) {
        throw new Error('Invalid response: missing user data');
      }
      setToken(result.token);
      // Return full result including isFirstLogin flag
      return {
        user: result.user,
        isFirstLogin: result.isFirstLogin || false
      };
    } catch (error) {
      console.error('[Auth] Login error:', error);
      throw error;
    }
  },
  
  async register(email, password, full_name) {
    const result = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name, ...systemPrefs() })
    });
    setToken(result.token);
    return result.user;
  },
  
  async googleLogin(credential, clientId, userInfo = null) {
    // If userInfo is provided, we're using the OAuth2 access token flow
    const body = userInfo 
      ? { accessToken: credential, clientId, userInfo, ...systemPrefs() }
      : { credential, clientId, ...systemPrefs() };
    
    const result = await request('/auth/google', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    setToken(result.token);
    // Return full result including isFirstLogin flag
    return {
      user: result.user,
      isFirstLogin: result.isFirstLogin || false
    };
  },
  
  async me() {
    try {
      return await request('/auth/me');
    } catch (error) {
      // Don't log 401 errors for /auth/me - they're expected when not authenticated
      if (error.status !== 401 && error.status !== 403) {
        console.error('[Auth] Me error:', error);
      }
      throw error;
    }
  },
  
  async updateMe(data) {
    return request('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },
  
  logout(redirectUrl) {
    removeToken();
    const go = () => {
      if (redirectUrl) {
        window.location.href = `/login?redirect=${encodeURIComponent(redirectUrl)}`;
      } else {
        window.location.href = '/login';
      }
    };
    // Forget the notes kept on this device for offline use (bounded, so sign-out never hangs)
    Promise.race([
      import('@/components/notes/notesSync').then(m => m.clearNotesStorage()),
      new Promise(resolve => setTimeout(resolve, 800)),
    ]).catch(() => {}).finally(go);
  },
  
  redirectToLogin(redirectUrl) {
    if (redirectUrl) {
      window.location.href = `/login?redirect=${encodeURIComponent(redirectUrl)}`;
    } else {
      window.location.href = '/login';
    }
  },
  
  isAuthenticated() {
    return !!getToken();
  }
};

// Entity factory - creates CRUD operations for any entity
function createEntity(entityPath) {
  return {
    async list(sort = '-created_date', limit = 1000) {
      const params = new URLSearchParams({ sort, limit: String(limit) });
      return request(`/entities/${entityPath}?${params}`);
    },
    
    async filter(filters, sort = '-created_date', limit = 1000) {
      const params = new URLSearchParams({ sort, limit: String(limit) });
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      }
      return request(`/entities/${entityPath}?${params}`);
    },
    
    async get(id) {
      return request(`/entities/${entityPath}?id=${id}&_single=true`);
    },
    
    async create(data) {
      return request(`/entities/${entityPath}`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    
    async bulkCreate(items) {
      return request(`/entities/${entityPath}`, {
        method: 'POST',
        body: JSON.stringify(items)
      });
    },
    
    async update(id, data) {
      return request(`/entities/${entityPath}?id=${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },
    
    async delete(id) {
      return request(`/entities/${entityPath}?id=${id}`, {
        method: 'DELETE'
      });
    }
  };
}

// Entities
const entities = {
  Account: createEntity('accounts'),
  Position: createEntity('positions'),
  DayTrade: createEntity('day-trades'),
  ExpenseTransaction: createEntity('transactions'),
  Budget: createEntity('budgets'),
  Category: createEntity('categories'),
  Card: createEntity('cards'),
  FinancialGoal: createEntity('goals'),
  Plan: createEntity('plans'),
  DashboardWidget: createEntity('dashboard-widgets'),
  PageLayout: createEntity('page-layouts'),
  SharedUser: createEntity('shared-users'),
  PortfolioSnapshot: createEntity('snapshots'),
  Note: {
    ...createEntity('notes'),
    // Permanently delete everything the caller has in the trash
    async emptyTrash() {
      return request('/entities/notes?action=empty-trash', { method: 'DELETE' });
    },
    // File attachments: bytes travel as base64 inside JSON
    async uploadFile(noteId, file) {
      return request(`/entities/notes?action=file&id=${noteId}`, {
        method: 'POST',
        body: JSON.stringify(file)
      });
    },
    async getFile(noteId, fileId) {
      return request(`/entities/notes?action=file&id=${noteId}&fileId=${fileId}`);
    },
    async deleteFile(noteId, fileId) {
      return request(`/entities/notes?action=file&id=${noteId}&fileId=${fileId}`, { method: 'DELETE' });
    }
  },
  PortfolioTransaction: createEntity('portfolio-transactions')
};

// Integrations
const integrations = {
  Core: {
    // Get stock quote for single symbol
    async getStockQuote(symbol, provider = 'finnhub') {
      return request(`/integrations/stock-quote?symbol=${symbol}&provider=${provider}`);
    },
    
    // Get stock quotes for multiple symbols
    async getStockQuotes(symbols, provider = 'finnhub') {
      const symbolsParam = Array.isArray(symbols) ? symbols.join(',') : symbols;
      return request(`/integrations/stock-quote?symbols=${symbolsParam}&provider=${provider}`);
    },
    
    async SendEmail({ to, subject, body, html }) {
      return request('/integrations/send-email', {
        method: 'POST',
        body: JSON.stringify({ to, subject, body, html })
      });
    },
    
    async UploadFile(file) {
      // For file uploads, we need to use FormData
      const formData = new FormData();
      formData.append('file', file);
      
      const token = getToken();
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${API_URL}/integrations/upload-file`, {
        method: 'POST',
        headers,
        body: formData
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }
      
      return data.data;
    },
    
    // Placeholder for other integrations - implement as needed
    async InvokeLLM(params) {
      console.warn('InvokeLLM not yet implemented');
      return { text: 'LLM integration not configured' };
    },
    
    async SendSMS(params) {
      console.warn('SendSMS not yet implemented');
      return { sent: false, message: 'SMS not configured' };
    },
    
    async GenerateImage(params) {
      console.warn('GenerateImage not yet implemented');
      return { url: null, message: 'Image generation not configured' };
    },
    
    async ExtractDataFromUploadedFile(params) {
      console.warn('ExtractDataFromUploadedFile not yet implemented');
      return { data: null, message: 'Data extraction not configured' };
    }
  }
};

// App logs (stub for compatibility)
const appLogs = {
  async logUserInApp(pageName) {
    // Can be implemented to track page views if needed
  }
};

// Workspaces API
const workspaces = {
  async list() {
    return request('/workspaces');
  },
  async get(id) {
    return request(`/workspaces?id=${id}`);
  },
  async create(data) {
    return request('/workspaces', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  async update(id, data) {
    return request(`/workspaces?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },
  async delete(id) {
    return request(`/workspaces?id=${id}`, {
      method: 'DELETE'
    });
  },
  async invite(id, data) {
    return request(`/workspaces?id=${id}&action=invite`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  async updateMember(workspaceId, memberId, data) {
    return request(`/workspaces?id=${workspaceId}&action=updateMember&memberId=${memberId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },
  async removeMember(workspaceId, memberId) {
    return request(`/workspaces?id=${workspaceId}&action=removeMember&memberId=${memberId}`, {
      method: 'DELETE'
    });
  },
  async resendInvite(workspaceId, memberId) {
    return request(`/workspaces?id=${workspaceId}&action=resend&memberId=${memberId}`, { method: 'POST' });
  },
  async leave(workspaceId) {
    return request(`/workspaces?id=${workspaceId}&action=leave`, { method: 'POST' });
  },
  async heartbeat(workspaceId) {
    return request(`/workspaces?id=${workspaceId}&action=heartbeat`, { method: 'POST' });
  },
  async myInvitations() {
    return request('/workspaces?action=invitations');
  },
  async acceptInvitation(token) {
    return request(`/workspaces?action=accept&token=${token}`, { method: 'POST' });
  },
  async declineInvitation(token) {
    return request(`/workspaces?action=decline&token=${token}`, { method: 'POST' });
  }
};

// Apple Pay: a personal key lets an iOS Shortcut add each purchase as a transaction
const applePay = {
  status: () => request('/integrations/quick-add'),
  createKey: () => request('/integrations/quick-add', { method: 'POST' }),
  revoke: () => request('/integrations/quick-add', { method: 'DELETE' })
};

// Ingest tokens: per-device credentials for the iPhone Shortcut (Apple Pay taps)
const ingestTokens = {
  list: () => request('/ingest-tokens'),
  create: (label) => request('/ingest-tokens', { method: 'POST', body: JSON.stringify({ label }) }),
  revoke: (id) => request(`/ingest-tokens?id=${id}`, { method: 'DELETE' }),
  activity: () => request('/ingest-tokens?activity=1')
};

// Web Push subscriptions for this user's devices
const push = {
  config: () => request('/push'),
  subscribe: (subscription) => request('/push', { method: 'POST', body: JSON.stringify({ subscription }) }),
  test: () => request('/push', { method: 'POST', body: JSON.stringify({ test: true }) }),
  unsubscribe: (endpoint) => request(`/push?endpoint=${encodeURIComponent(endpoint)}`, { method: 'DELETE' })
};

// Main client export - maintains same interface as base44 client
export const ascent = {
  auth,
  entities,
  workspaces,
  integrations,
  applePay,
  ingestTokens,
  push,
  appLogs
};

// For backwards compatibility during migration
export const api = ascent;
export default ascent;


// Device language/theme, sent on sign-up so new accounts start in the user's own settings
export function systemPrefs() {
  try {
    const lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return {
      language: ['en', 'he', 'ru'].includes(lang) ? lang : 'en',
      theme: window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
    };
  } catch {
    return {};
  }
}

