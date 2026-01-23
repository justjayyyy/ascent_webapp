import { google } from 'googleapis';

// Google Calendar API integration
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[Google Calendar] Missing or invalid authorization header');
    return res.status(401).json({ error: 'Google access token required' });
  }

  const accessToken = authHeader.split(' ')[1];
  console.log(`[Google Calendar] Action: ${req.query.action}, Token length: ${accessToken?.length}`);

  // Create OAuth2 client with access token
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  try {
    const { action } = req.query;

    switch (action) {
      case 'list-calendars': {
        const response = await calendar.calendarList.list();
        return res.json(response.data.items || []);
      }

      case 'list-events': {
        const { calendarId = 'primary', timeMin, timeMax, maxResults = 50 } = req.query;
        const response = await calendar.events.list({
          calendarId,
          timeMin: timeMin || new Date().toISOString(),
          timeMax: timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          maxResults: parseInt(maxResults),
          singleEvents: true,
          orderBy: 'startTime',
        });
        return res.json(response.data.items || []);
      }

      case 'get-event': {
        const { calendarId = 'primary', eventId } = req.query;
        if (!eventId) {
          return res.status(400).json({ error: 'Event ID required' });
        }
        const response = await calendar.events.get({ calendarId, eventId });
        return res.json(response.data);
      }

      case 'create-event': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'POST method required' });
        }
        const { calendarId = 'primary' } = req.query;
        const event = req.body;
        const response = await calendar.events.insert({
          calendarId,
          resource: event,
        });
        return res.json(response.data);
      }

      case 'update-event': {
        if (req.method !== 'PUT') {
          return res.status(405).json({ error: 'PUT method required' });
        }
        const { calendarId = 'primary', eventId } = req.query;
        if (!eventId) {
          return res.status(400).json({ error: 'Event ID required' });
        }
        const event = req.body;
        const response = await calendar.events.update({
          calendarId,
          eventId,
          resource: event,
        });
        return res.json(response.data);
      }

      case 'delete-event': {
        if (req.method !== 'DELETE') {
          return res.status(405).json({ error: 'DELETE method required' });
        }
        const { calendarId = 'primary', eventId } = req.query;
        if (!eventId) {
          return res.status(400).json({ error: 'Event ID required' });
        }
        await calendar.events.delete({ calendarId, eventId });
        return res.json({ success: true });
      }

      case 'get-colors': {
        // Get calendar color definitions
        const response = await calendar.colors.get();
        return res.json(response.data || {});
      }

      case 'list-tasks': {
        // List tasks from Google Tasks API
        try {
          const tasks = google.tasks({ version: 'v1', auth: oauth2Client });
          
          // First get all task lists
          const taskListsRes = await tasks.tasklists.list({ maxResults: 100 });
          const taskLists = taskListsRes.data.items || [];
          
          if (taskLists.length === 0) {
            return res.json([]);
          }
          
          // Get ALL tasks from each list (including completed ones for history)
          const allTasks = [];
          for (const list of taskLists) {
            try {
              // Fetch incomplete tasks
              const tasksRes = await tasks.tasks.list({
                tasklist: list.id,
                maxResults: 100,
                showCompleted: true,  // Include completed tasks too
                showHidden: true,     // Include hidden tasks
              });
              const listTasks = (tasksRes.data.items || []).map(task => ({
                ...task,
                taskListId: list.id,
                taskListTitle: list.title,
              }));
              allTasks.push(...listTasks);
            } catch (e) {
              console.log(`Failed to fetch tasks from list ${list.id}:`, e.message);
            }
          }
          
          return res.json(allTasks);
        } catch (taskError) {
          console.log('Tasks API error (might not have permission):', taskError.message);
          return res.json([]); // Return empty if tasks not accessible
        }
      }

      case 'create-task': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'POST method required' });
        }
        try {
          console.log('[create-task] Request body:', req.body);
          
          const tasks = google.tasks({ version: 'v1', auth: oauth2Client });
          const { tasklistId } = req.query;
          
          // Get the first task list if not specified
          let listId = tasklistId;
          if (!listId) {
            console.log('[create-task] Fetching task lists...');
            const taskListsRes = await tasks.tasklists.list({ maxResults: 1 });
            const taskLists = taskListsRes.data.items || [];
            console.log('[create-task] Found task lists:', taskLists.length);
            
            if (taskLists.length === 0) {
              // Create a default task list if none exists
              console.log('[create-task] Creating default task list...');
              const newList = await tasks.tasklists.insert({ resource: { title: 'My Tasks' } });
              listId = newList.data.id;
            } else {
              listId = taskLists[0].id;
            }
          }
          
          console.log('[create-task] Using task list:', listId);
          
          const task = req.body;
          const response = await tasks.tasks.insert({
            tasklist: listId,
            resource: task,
          });
          console.log('[create-task] Task created:', response.data);
          return res.json(response.data);
        } catch (taskError) {
          console.error('[create-task] Error:', taskError.message, taskError.code, taskError.response?.data);
          
          // Check for specific error types
          if (taskError.code === 401 || taskError.message?.includes('invalid_token')) {
            return res.status(401).json({ error: 'Invalid token', message: 'Please reconnect your Google account' });
          }
          if (taskError.code === 403 || taskError.message?.includes('insufficient')) {
            return res.status(403).json({ error: 'Permission denied', message: 'Please reconnect to grant Tasks permission' });
          }
          
          return res.status(500).json({ error: 'Failed to create task', message: taskError.message });
        }
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Use: list-calendars, list-events, get-event, create-event, update-event, delete-event, get-colors, list-tasks' });
    }
  } catch (error) {
    console.error('[Google Calendar] API error:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data
    });
    
    // Handle various Google API errors
    const errorMessage = error.message || '';
    const errorCode = error.code || error.response?.status;
    
    if (errorCode === 401 || errorMessage.includes('invalid_token') || errorMessage.includes('Invalid Credentials') || errorMessage.includes('Request had invalid authentication credentials')) {
      return res.status(401).json({ error: 'Invalid or expired Google token. Please re-authenticate.' });
    }
    
    if (errorCode === 403 || errorMessage.includes('forbidden') || errorMessage.includes('insufficient')) {
      return res.status(403).json({ error: 'Access denied. Please ensure calendar permissions are granted.' });
    }

    if (errorCode === 404) {
      return res.status(404).json({ error: 'Calendar or event not found.' });
    }
    
    return res.status(500).json({ 
      error: 'Calendar API error', 
      message: error.message || 'Unknown error occurred',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

