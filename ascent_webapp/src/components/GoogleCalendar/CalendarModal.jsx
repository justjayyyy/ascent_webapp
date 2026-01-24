// @ts-nocheck
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  X,
  Clock,
  MapPin,
  RefreshCw,
  Trash2,
  Check,
  CalendarDays,
  CalendarRange,
  LayoutGrid,
  GripVertical
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/ThemeProvider';
import { toast } from 'sonner';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths, 
  startOfWeek, 
  endOfWeek, 
  parseISO, 
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  setHours,
  setMinutes,
  getHours,
  getMinutes,
  differenceInMinutes,
  addMinutes
} from 'date-fns';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const CALENDAR_SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks';

// Hours to display (6 AM to 10 PM)
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);
const HOUR_HEIGHT = 60; // pixels per hour

// Google Calendar color palette (colorId -> hex color)
const GOOGLE_CALENDAR_COLORS = {
  '1': '#7986CB',  // Lavender
  '2': '#33B679',  // Sage
  '3': '#8E24AA',  // Grape
  '4': '#E67C73',  // Flamingo
  '5': '#F6BF26',  // Banana
  '6': '#F4511E',  // Tangerine
  '7': '#039BE5',  // Peacock
  '8': '#616161',  // Graphite
  '9': '#3F51B5',  // Blueberry
  '10': '#0B8043', // Basil
  '11': '#D50000', // Tomato
  'default': '#5C8374', // Our app color
};

export default function CalendarModal({ open, onOpenChange }) {
  const { colors, t, theme, isRTL } = useTheme();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [calendarColors, setCalendarColors] = useState({});
  const [accessToken, setAccessToken] = useState(null);
  const [view, setView] = useState('month');
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventForm, setEventForm] = useState({
    summary: '',
    description: '',
    location: '',
    start: '',
    end: '',
    allDay: false,
  });
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    notes: '',
    due: '',
  });
  
  // Drag state
  const [draggingEvent, setDraggingEvent] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [resizingEvent, setResizingEvent] = useState(null);
  const dayColumnRef = useRef(null);

  // Check for existing token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('googleCalendarToken');
    const tokenExpiry = localStorage.getItem('googleCalendarTokenExpiry');
    
    if (storedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
      setAccessToken(storedToken);
      setIsAuthenticated(true);
    }
  }, []);

  // Fetch events when authenticated
  useEffect(() => {
    if (isAuthenticated && accessToken && open) {
      const timeoutId = setTimeout(() => {
        fetchEvents();
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [isAuthenticated, accessToken, currentDate, open]);

  const handleGoogleAuth = useCallback(() => {
    if (!window.google || !GOOGLE_CLIENT_ID) {
      toast.error('Google Sign-In not available');
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: CALENDAR_SCOPES,
      callback: (response) => {
        if (response.access_token) {
          setAccessToken(response.access_token);
          setIsAuthenticated(true);
          localStorage.setItem('googleCalendarToken', response.access_token);
          localStorage.setItem('googleCalendarTokenExpiry', String(Date.now() + 3600000));
          toast.success(t('calendarConnected') || 'Google Calendar connected!');
        } else if (response.error) {
          toast.error('Failed to connect to Google Calendar');
        }
      },
    });

    tokenClient.requestAccessToken({ prompt: 'consent' }); // Force consent to get new scopes
  }, [t]);

  const disconnectCalendar = useCallback(() => {
    localStorage.removeItem('googleCalendarToken');
    localStorage.removeItem('googleCalendarTokenExpiry');
    setAccessToken(null);
    setIsAuthenticated(false);
    setEvents([]);
    setTasks([]);
    setHolidays([]);
    toast.success(t('calendarDisconnected') || 'Calendar disconnected');
  }, [t]);

  const fetchEvents = async (showLoading = true) => {
    if (!accessToken) return;
    
    // Never show loading spinner - calendar loads immediately
    // Only set isRefreshing for the refresh button animation
    setIsRefreshing(true);
    
    try {
      // Fetch 6 months of data (3 before, 3 after)
      const start = startOfMonth(subMonths(currentDate, 3));
      const end = endOfMonth(addMonths(currentDate, 3));
      
      // Fetch events, colors, tasks, and Jewish holidays in parallel
      const [eventsRes, colorsRes, tasksRes, holidaysRes] = await Promise.allSettled([
        // Regular events
        fetch(
          `/api/integrations/google-calendar?action=list-events&timeMin=${start.toISOString()}&timeMax=${end.toISOString()}&maxResults=500`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        ),
        // Calendar colors
        fetch(
          `/api/integrations/google-calendar?action=get-colors`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        ),
        // Tasks
        fetch(
          `/api/integrations/google-calendar?action=list-tasks`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        ),
        // Jewish Holidays calendar
        fetch(
          `/api/integrations/google-calendar?action=list-events&calendarId=en.jewish%23holiday%40group.v.calendar.google.com&timeMin=${start.toISOString()}&timeMax=${end.toISOString()}&maxResults=100`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        ),
      ]);
      
      // Process events
      if (eventsRes.status === 'fulfilled' && eventsRes.value.ok) {
        const data = await eventsRes.value.json();
        setEvents(Array.isArray(data) ? data : []);
      } else if (eventsRes.status === 'fulfilled' && eventsRes.value.status === 401) {
        localStorage.removeItem('googleCalendarToken');
        localStorage.removeItem('googleCalendarTokenExpiry');
        setIsAuthenticated(false);
        setAccessToken(null);
        toast.error(t('calendarSessionExpired') || 'Calendar session expired. Please reconnect.');
        return;
      }
      
      // Process colors
      if (colorsRes.status === 'fulfilled' && colorsRes.value.ok) {
        const colorData = await colorsRes.value.json();
        if (colorData.event) {
          const colors = {};
          Object.entries(colorData.event).forEach(([id, color]) => {
            colors[id] = color.background;
          });
          setCalendarColors(colors);
        }
      }
      
      // Process tasks
      if (tasksRes.status === 'fulfilled' && tasksRes.value.ok) {
        const taskData = await tasksRes.value.json();
        setTasks(Array.isArray(taskData) ? taskData : []);
      }
      
      // Process Jewish holidays
      if (holidaysRes.status === 'fulfilled' && holidaysRes.value.ok) {
        const holidayData = await holidaysRes.value.json();
        setHolidays(Array.isArray(holidayData) ? holidayData.map(h => ({ ...h, isHoliday: true })) : []);
      }
      
    } catch (error) {
      console.error('Failed to fetch calendar data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const createEvent = async () => {
    if (!eventForm.summary) {
      toast.error(t('eventTitleRequired') || 'Event title is required');
      return;
    }

    try {
      const event = {
        summary: eventForm.summary,
        description: eventForm.description,
        location: eventForm.location,
        start: eventForm.allDay 
          ? { date: eventForm.start }
          : { dateTime: new Date(eventForm.start).toISOString() },
        end: eventForm.allDay
          ? { date: eventForm.end || eventForm.start }
          : { dateTime: new Date(eventForm.end || eventForm.start).toISOString() },
      };

      const response = await fetch(`/api/integrations/google-calendar?action=create-event`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });

      if (response.ok) {
        toast.success(t('eventCreated') || 'Event created!');
        setShowEventForm(false);
        resetEventForm();
        fetchEvents();
      } else {
        toast.error('Failed to create event');
      }
    } catch (error) {
      console.error('Failed to create event:', error);
      toast.error('Failed to create event');
    }
  };

  const createTask = async () => {
    if (!taskForm.title) {
      toast.error(t('taskTitleRequired') || 'Task title is required');
      return;
    }

    try {
      const task = {
        title: taskForm.title,
        notes: taskForm.notes,
      };
      
      // Format due date for Google Tasks API (RFC 3339 format)
      if (taskForm.due) {
        task.due = new Date(taskForm.due).toISOString();
      }
      
      const response = await fetch(`/api/integrations/google-calendar?action=create-task`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(task),
      });

      const responseData = await response.json();

      if (response.ok) {
        toast.success(t('taskCreated') || 'Task created!');
        setShowTaskForm(false);
        resetTaskForm();
        fetchEvents();
      } else {
        console.error('Task creation failed:', responseData);
        toast.error(responseData.message || 'Failed to create task');
      }
    } catch (error) {
      console.error('Failed to create task:', error);
      toast.error('Failed to create task');
    }
  };

  const resetTaskForm = () => {
    setTaskForm({
      title: '',
      notes: '',
      due: format(selectedDate, 'yyyy-MM-dd'),
    });
  };

  const updateEvent = async (eventId = editingEvent?.id, eventData = null) => {
    const id = eventId || editingEvent?.id;
    if (!id) return;

    const data = eventData || {
      summary: eventForm.summary,
      description: eventForm.description,
      location: eventForm.location,
      start: eventForm.allDay 
        ? { date: eventForm.start }
        : { dateTime: new Date(eventForm.start).toISOString() },
      end: eventForm.allDay
        ? { date: eventForm.end || eventForm.start }
        : { dateTime: new Date(eventForm.end || eventForm.start).toISOString() },
    };

    try {
      const response = await fetch(`/api/integrations/google-calendar?action=update-event&eventId=${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        if (!eventData) {
          toast.success(t('eventUpdated') || 'Event updated!');
          setShowEventForm(false);
          setEditingEvent(null);
          resetEventForm();
        }
        fetchEvents();
      } else {
        toast.error('Failed to update event');
      }
    } catch (error) {
      console.error('Failed to update event:', error);
      toast.error('Failed to update event');
    }
  };

  const deleteEvent = async (eventId) => {
    try {
      const response = await fetch(`/api/integrations/google-calendar?action=delete-event&eventId=${eventId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (response.ok) {
        toast.success(t('eventDeleted') || 'Event deleted!');
        setShowEventForm(false);
        setEditingEvent(null);
        fetchEvents();
      } else {
        toast.error('Failed to delete event');
      }
    } catch (error) {
      console.error('Failed to delete event:', error);
      toast.error('Failed to delete event');
    }
  };

  const resetEventForm = () => {
    setEventForm({
      summary: '',
      description: '',
      location: '',
      start: '',
      end: '',
      allDay: false,
    });
    setEditingEvent(null);
  };

  const openEditEvent = (event, e) => {
    if (e) e.stopPropagation();
    setEditingEvent(event);
    setEventForm({
      summary: event.summary || '',
      description: event.description || '',
      location: event.location || '',
      start: event.start?.dateTime 
        ? format(parseISO(event.start.dateTime), "yyyy-MM-dd'T'HH:mm")
        : event.start?.date || '',
      end: event.end?.dateTime 
        ? format(parseISO(event.end.dateTime), "yyyy-MM-dd'T'HH:mm")
        : event.end?.date || '',
      allDay: !!event.start?.date,
    });
    setShowEventForm(true);
  };

  const openNewEvent = (date = selectedDate, hour = 9) => {
    setEditingEvent(null);
    const startTime = new Date(date);
    startTime.setHours(hour, 0, 0, 0);
    const endTime = new Date(date);
    endTime.setHours(hour + 1, 0, 0, 0);
    
    setEventForm({
      summary: '',
      description: '',
      location: '',
      start: format(startTime, "yyyy-MM-dd'T'HH:mm"),
      end: format(endTime, "yyyy-MM-dd'T'HH:mm"),
      allDay: false,
    });
    setShowEventForm(true);
  };

  // Handle date click - switch to day view instantly (no loading)
  const handleDateClick = (day) => {
    setSelectedDate(day);
    setCurrentDate(day);
    setView('day'); // Switch to day view on click - no loading delay
  };

  // Navigation handlers
  const navigatePrev = () => {
    if (view === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (view === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };

  const navigateNext = () => {
    if (view === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (view === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };

  // Get event color
  const getEventColor = useCallback((event) => {
    if (event.isHoliday) return '#3F51B5'; // Blue for Jewish holidays
    if (event.isTask) return '#F6BF26'; // Yellow for tasks
    
    // Use custom colors from API if available
    if (event.colorId && calendarColors[event.colorId]) {
      return calendarColors[event.colorId];
    }
    // Fallback to our predefined colors
    if (event.colorId && GOOGLE_CALENDAR_COLORS[event.colorId]) {
      return GOOGLE_CALENDAR_COLORS[event.colorId];
    }
    return GOOGLE_CALENDAR_COLORS.default;
  }, [calendarColors]);

  // Get all items (events + tasks + holidays) for a specific date
  const getEventsForDate = useCallback((date) => {
    const dayEvents = events.filter(event => {
      const eventStart = event.start?.dateTime 
        ? parseISO(event.start.dateTime)
        : event.start?.date 
          ? parseISO(event.start.date)
          : null;
      return eventStart && isSameDay(eventStart, date);
    });
    
    // Add Jewish holidays for this date
    const dayHolidays = holidays.filter(h => {
      const holidayDate = h.start?.date ? parseISO(h.start.date) : null;
      return holidayDate && isSameDay(holidayDate, date);
    });
    
    // Add tasks due this date
    const dayTasks = tasks.filter(task => {
      if (!task.due) return false;
      try {
        // Google Tasks API returns due date in RFC 3339 format
        // Parse it and compare just the date part
        const dueDate = parseISO(task.due);
        return isSameDay(dueDate, date);
      } catch (e) {
        console.warn('Failed to parse task due date:', task.due, e);
        return false;
      }
    }).map(task => ({
      ...task,
      isTask: true,
      summary: task.title,
      start: { date: task.due?.split('T')[0] || task.due },
    }));
    
    return [...dayHolidays, ...dayEvents, ...dayTasks];
  }, [events, holidays, tasks]);

  // Get events for a specific hour on a date
  const getEventsForHour = useCallback((date, hour) => {
    return events.filter(event => {
      if (!event.start?.dateTime) return false;
      const eventStart = parseISO(event.start.dateTime);
      return isSameDay(eventStart, date) && getHours(eventStart) === hour;
    });
  }, [events]);

  // Calculate event position and height for time-based views
  const getEventStyle = useCallback((event) => {
    if (!event.start?.dateTime || !event.end?.dateTime) return {};
    
    const start = parseISO(event.start.dateTime);
    const end = parseISO(event.end.dateTime);
    const startHour = getHours(start);
    const startMinutes = getMinutes(start);
    const duration = Math.max(differenceInMinutes(end, start), 30);
    
    const top = ((startHour - 6) * 60 + startMinutes) * (HOUR_HEIGHT / 60);
    const height = Math.max(duration * (HOUR_HEIGHT / 60), 25);
    
    return { top: `${top}px`, height: `${height}px` };
  }, []);

  // Drag handlers for events
  const handleEventDragStart = (event, e) => {
    e.stopPropagation();
    setDraggingEvent(event);
    const eventStart = parseISO(event.start.dateTime);
    const startMinutes = getHours(eventStart) * 60 + getMinutes(eventStart);
    setDragOffset(startMinutes - 6 * 60); // Offset from 6 AM
  };

  const handleEventDrag = useCallback((e) => {
    if (!draggingEvent || !dayColumnRef.current) return;
    
    const rect = dayColumnRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutes = Math.round((y / HOUR_HEIGHT) * 60);
    const snappedMinutes = Math.round(minutes / 15) * 15; // Snap to 15-minute intervals
    const newStartMinutes = Math.max(0, Math.min(snappedMinutes, 16 * 60)); // 6 AM to 10 PM
    
    setDragOffset(newStartMinutes);
  }, [draggingEvent]);

  const handleEventDragEnd = useCallback(async () => {
    if (!draggingEvent) return;
    
    const originalStart = parseISO(draggingEvent.start.dateTime);
    const originalEnd = parseISO(draggingEvent.end.dateTime);
    const duration = differenceInMinutes(originalEnd, originalStart);
    
    const newStartHour = Math.floor((dragOffset + 6 * 60) / 60);
    const newStartMinute = (dragOffset + 6 * 60) % 60;
    
    const newStart = setMinutes(setHours(currentDate, newStartHour), newStartMinute);
    const newEnd = addMinutes(newStart, duration);
    
    // Update the event
    await updateEvent(draggingEvent.id, {
      summary: draggingEvent.summary,
      description: draggingEvent.description,
      location: draggingEvent.location,
      start: { dateTime: newStart.toISOString() },
      end: { dateTime: newEnd.toISOString() },
    });
    
    setDraggingEvent(null);
    setDragOffset(0);
  }, [draggingEvent, dragOffset, currentDate, updateEvent]);

  // Resize handlers
  const handleResizeStart = (event, e) => {
    e.stopPropagation();
    setResizingEvent(event);
  };

  const handleResize = useCallback((e) => {
    if (!resizingEvent || !dayColumnRef.current) return;
    
    const rect = dayColumnRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutes = Math.round((y / HOUR_HEIGHT) * 60);
    const snappedMinutes = Math.round(minutes / 15) * 15;
    
    // Update local state for visual feedback
    const eventStart = parseISO(resizingEvent.start.dateTime);
    const startMinutes = (getHours(eventStart) - 6) * 60 + getMinutes(eventStart);
    const newDuration = Math.max(snappedMinutes - startMinutes, 15);
    
    setResizingEvent(prev => ({
      ...prev,
      _tempDuration: newDuration
    }));
  }, [resizingEvent]);

  const handleResizeEnd = useCallback(async () => {
    if (!resizingEvent) return;
    
    const eventStart = parseISO(resizingEvent.start.dateTime);
    const newDuration = resizingEvent._tempDuration || differenceInMinutes(parseISO(resizingEvent.end.dateTime), eventStart);
    const newEnd = addMinutes(eventStart, newDuration);
    
    await updateEvent(resizingEvent.id, {
      summary: resizingEvent.summary,
      description: resizingEvent.description,
      location: resizingEvent.location,
      start: { dateTime: eventStart.toISOString() },
      end: { dateTime: newEnd.toISOString() },
    });
    
    setResizingEvent(null);
  }, [resizingEvent, updateEvent]);

  // Mouse move/up handlers for drag/resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (draggingEvent) handleEventDrag(e);
      if (resizingEvent) handleResize(e);
    };
    
    const handleMouseUp = () => {
      if (draggingEvent) handleEventDragEnd();
      if (resizingEvent) handleResizeEnd();
    };
    
    if (draggingEvent || resizingEvent) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingEvent, resizingEvent, handleEventDrag, handleEventDragEnd, handleResize, handleResizeEnd]);

  // Calendar calculations
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Week view days
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });

  const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Get header text based on view
  const getHeaderText = () => {
    if (view === 'month') return format(currentDate, 'MMMM yyyy');
    if (view === 'week') return `${format(weekStart, 'MMM d')} - ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`;
    return format(currentDate, 'EEEE, MMMM d, yyyy');
  };

  // Render draggable event for day view
  const renderDayViewEvent = (event, index) => {
    const isDragging = draggingEvent?.id === event.id;
    const isResizing = resizingEvent?.id === event.id;
    
    let style = getEventStyle(event);
    
    if (isDragging) {
      style = {
        ...style,
        top: `${dragOffset * (HOUR_HEIGHT / 60)}px`,
        opacity: 0.8,
        zIndex: 100,
      };
    }
    
    if (isResizing && resizingEvent._tempDuration) {
      style = {
        ...style,
        height: `${resizingEvent._tempDuration * (HOUR_HEIGHT / 60)}px`,
      };
    }
    
    return (
      <div
        key={event.id || index}
        className={cn(
          "absolute left-1 right-4 px-2 py-1 rounded overflow-hidden select-none",
          "hover:opacity-90 transition-opacity",
          (isDragging || isResizing) && "shadow-lg",
          event.isHoliday ? "cursor-default" : "cursor-move"
        )}
        style={{ 
          backgroundColor: getEventColor(event), 
          color: '#fff',
          ...style
        }}
        onClick={(e) => openEditEvent(event, e)}
        onMouseDown={(e) => handleEventDragStart(event, e)}
        title={`${event.summary} - Drag to move, drag bottom edge to resize`}
      >
        {/* Drag handle */}
        <div className="absolute top-0 left-0 right-0 h-4 flex items-center justify-center cursor-move opacity-50 hover:opacity-100">
          <GripVertical className="w-3 h-3" />
        </div>
        
        <div className="font-medium text-sm truncate mt-2">{event.summary}</div>
        <div className="text-xs opacity-75">
          {format(parseISO(event.start.dateTime), 'h:mm a')} - 
          {event.end?.dateTime && format(parseISO(event.end.dateTime), 'h:mm a')}
        </div>
        {event.location && (
          <div className="text-xs opacity-75 flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3" />
            {event.location}
          </div>
        )}
        
        {/* Resize handle */}
        <div 
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize bg-white/20 hover:bg-white/40 transition-colors"
          onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(event, e); }}
          title="Drag to resize"
        />
      </div>
    );
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={cn(
          "max-w-6xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col p-0",
          colors.bgSecondary, 
          colors.border
        )}
      >
        {/* Header */}
        <DialogHeader className={cn("flex flex-row items-center justify-between p-4 border-b", colors.border)}>
          <div className="flex items-center gap-2">
            <CalendarIcon className={cn("w-5 h-5", colors.accentText)} />
            <DialogTitle className={cn("font-semibold text-base", colors.textPrimary)}>
              {t('googleCalendar') || 'Google Calendar'}
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            {t('calendarDescription') || 'View and manage your Google Calendar events'}
          </DialogDescription>
          
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {!isAuthenticated ? (
            // Auth Screen
            <div className="flex flex-col items-center justify-center h-full py-12">
              <CalendarIcon className={cn("w-16 h-16 mb-4", colors.accentText)} />
              <h3 className={cn("text-xl font-semibold mb-2", colors.textPrimary)}>
                {t('connectCalendar') || 'Connect Your Calendar'}
              </h3>
              <p className={cn("text-center mb-6 max-w-md", colors.textSecondary)}>
                {t('connectCalendarDesc') || 'Connect your Google Calendar to view and manage your events directly from the app.'}
              </p>
              <Button
                onClick={handleGoogleAuth}
                className="bg-[#4285F4] hover:bg-[#357ABD] text-white"
              >
                <img 
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
                  alt="Google" 
                  className="w-5 h-5 mr-2"
                />
                {t('connectWithGoogle') || 'Connect with Google'}
              </Button>
            </div>
          ) : showEventForm ? (
            // Event Form
            <div className={cn("p-4 overflow-y-auto max-h-[70vh]", isRTL && "text-right")} dir={isRTL ? 'rtl' : 'ltr'}>
              <div className={cn("flex items-center justify-between mb-4", isRTL && "flex-row-reverse")}>
                <h3 className={cn("text-lg font-semibold", colors.textPrimary)}>
                  {editingEvent ? (t('editEvent') || 'Edit Event') : (t('newEvent') || 'New Event')}
                </h3>
              </div>

              <div className="space-y-4 max-w-xl">
                <div>
                  <Label className={cn(colors.textSecondary, isRTL && "block text-right")}>{t('eventTitle') || 'Title'}</Label>
                  <Input
                    value={eventForm.summary}
                    onChange={(e) => setEventForm(prev => ({ ...prev, summary: e.target.value }))}
                    placeholder={t('eventTitlePlaceholder') || 'Add title'}
                    className={cn(colors.bgPrimary, colors.border, colors.textPrimary, isRTL && "text-right")}
                    dir={isRTL ? 'rtl' : 'ltr'}
                  />
                </div>

                <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-4", isRTL && "direction-rtl")}>
                  <div>
                    <Label className={cn(colors.textSecondary, isRTL && "block text-right")}>{t('startTime') || 'Start'}</Label>
                    <Input
                      type={eventForm.allDay ? 'date' : 'datetime-local'}
                      value={eventForm.start}
                      onChange={(e) => setEventForm(prev => ({ ...prev, start: e.target.value }))}
                      className={cn(colors.bgPrimary, colors.border, colors.textPrimary)}
                    />
                  </div>
                  <div>
                    <Label className={cn(colors.textSecondary, isRTL && "block text-right")}>{t('endTime') || 'End'}</Label>
                    <Input
                      type={eventForm.allDay ? 'date' : 'datetime-local'}
                      value={eventForm.end}
                      onChange={(e) => setEventForm(prev => ({ ...prev, end: e.target.value }))}
                      className={cn(colors.bgPrimary, colors.border, colors.textPrimary)}
                    />
                  </div>
                </div>

                <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse justify-end")}>
                  <input
                    type="checkbox"
                    id="allDay"
                    checked={eventForm.allDay}
                    onChange={(e) => setEventForm(prev => ({ ...prev, allDay: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="allDay" className={colors.textSecondary}>
                    {t('allDayEvent') || 'All day event'}
                  </Label>
                </div>

                <div>
                  <Label className={cn(colors.textSecondary, isRTL && "block text-right")}>{t('location') || 'Location'}</Label>
                  <div className="relative">
                    <MapPin className={cn(
                      "absolute top-1/2 -translate-y-1/2 w-4 h-4", 
                      colors.textTertiary,
                      isRTL ? "right-3" : "left-3"
                    )} />
                    <Input
                      value={eventForm.location}
                      onChange={(e) => setEventForm(prev => ({ ...prev, location: e.target.value }))}
                      placeholder={t('addLocation') || 'Add location'}
                      className={cn(
                        colors.bgPrimary, colors.border, colors.textPrimary,
                        isRTL ? "pr-10 text-right" : "pl-10"
                      )}
                      dir={isRTL ? 'rtl' : 'ltr'}
                    />
                  </div>
                </div>

                <div>
                  <Label className={cn(colors.textSecondary, isRTL && "block text-right")}>{t('description') || 'Description'}</Label>
                  <Textarea
                    value={eventForm.description}
                    onChange={(e) => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder={t('addDescription') || 'Add description'}
                    rows={3}
                    className={cn(colors.bgPrimary, colors.border, colors.textPrimary, isRTL && "text-right")}
                    dir={isRTL ? 'rtl' : 'ltr'}
                  />
                </div>

                <div className={cn("flex gap-2 pt-4", isRTL && "flex-row-reverse")}>
                  {editingEvent && (
                    <Button
                      variant="outline"
                      onClick={() => deleteEvent(editingEvent.id)}
                      className="text-red-500 border-red-500/50 hover:bg-red-500/10"
                    >
                      <Trash2 className={cn("w-4 h-4", isRTL ? "ml-2" : "mr-2")} />
                      {t('delete') || 'Delete'}
                    </Button>
                  )}
                  <div className="flex-1" />
                  <Button
                    variant="outline"
                    onClick={() => { setShowEventForm(false); resetEventForm(); }}
                    className={cn(colors.border, colors.textSecondary)}
                  >
                    {t('cancel') || 'Cancel'}
                  </Button>
                  <Button
                    onClick={editingEvent ? () => updateEvent() : createEvent}
                    className="bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
                  >
                    <Check className={cn("w-4 h-4", isRTL ? "ml-2" : "mr-2")} />
                    {editingEvent ? (t('save') || 'Save') : (t('create') || 'Create')}
                  </Button>
                </div>
              </div>
            </div>
          ) : showTaskForm ? (
            // Task Form
            <div className={cn("p-4 overflow-y-auto max-h-[70vh]", isRTL && "text-right")} dir={isRTL ? 'rtl' : 'ltr'}>
              <div className={cn("flex items-center justify-between mb-4", isRTL && "flex-row-reverse")}>
                <h3 className={cn("text-lg font-semibold", colors.textPrimary)}>
                  {t('newTask') || 'New Task'}
                </h3>
              </div>

              <div className="space-y-4 max-w-xl">
                <div>
                  <Label className={cn(colors.textSecondary, isRTL && "block text-right")}>{t('taskTitle') || 'Task Title'}</Label>
                  <Input
                    value={taskForm.title}
                    onChange={(e) => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder={t('taskTitlePlaceholder') || 'Add task title'}
                    className={cn(colors.bgPrimary, colors.border, colors.textPrimary, isRTL && "text-right")}
                    dir={isRTL ? 'rtl' : 'ltr'}
                  />
                </div>

                <div>
                  <Label className={cn(colors.textSecondary, isRTL && "block text-right")}>{t('dueDate') || 'Due Date'}</Label>
                  <Input
                    type="date"
                    value={taskForm.due}
                    onChange={(e) => setTaskForm(prev => ({ ...prev, due: e.target.value }))}
                    className={cn(colors.bgPrimary, colors.border, colors.textPrimary)}
                  />
                </div>

                <div>
                  <Label className={cn(colors.textSecondary, isRTL && "block text-right")}>{t('notes') || 'Notes'}</Label>
                  <Textarea
                    value={taskForm.notes}
                    onChange={(e) => setTaskForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder={t('addNotes') || 'Add notes'}
                    rows={3}
                    className={cn(colors.bgPrimary, colors.border, colors.textPrimary, isRTL && "text-right")}
                    dir={isRTL ? 'rtl' : 'ltr'}
                  />
                </div>

                <div className={cn("flex gap-2 pt-4", isRTL && "flex-row-reverse")}>
                  <div className="flex-1" />
                  <Button
                    variant="outline"
                    onClick={() => { setShowTaskForm(false); resetTaskForm(); }}
                    className={cn(colors.border, colors.textSecondary)}
                  >
                    {t('cancel') || 'Cancel'}
                  </Button>
                  <Button
                    onClick={createTask}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white"
                  >
                    <Check className={cn("w-4 h-4", isRTL ? "ml-2" : "mr-2")} />
                    {t('create') || 'Create'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            // Calendar Views
            <div className="flex flex-col h-full">
              {/* Calendar Navigation & View Switcher */}
              <div className={cn("flex items-center justify-between px-4 py-3 border-b flex-wrap gap-2", colors.border)}>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={navigatePrev}
                    className={colors.textSecondary}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={navigateNext}
                    className={colors.textSecondary}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <h3 className={cn("text-lg font-semibold min-w-[200px]", colors.textPrimary)}>
                    {getHeaderText()}
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToToday}
                    className={cn("ml-2", colors.border, colors.textSecondary)}
                  >
                    {t('today') || 'Today'}
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  {/* View Switcher */}
                  <div className={cn("flex rounded-lg overflow-hidden border", colors.border)}>
                    <button
                      onClick={() => setView('day')}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors",
                        view === 'day' 
                          ? "bg-[#5C8374] text-white" 
                          : cn(colors.textSecondary, "hover:bg-[#5C8374]/20")
                      )}
                    >
                      <CalendarDays className="w-4 h-4" />
                      {t('day') || 'Day'}
                    </button>
                    <button
                      onClick={() => setView('week')}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors border-x",
                        colors.border,
                        view === 'week' 
                          ? "bg-[#5C8374] text-white" 
                          : cn(colors.textSecondary, "hover:bg-[#5C8374]/20")
                      )}
                    >
                      <CalendarRange className="w-4 h-4" />
                      {t('week') || 'Week'}
                    </button>
                    <button
                      onClick={() => setView('month')}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors",
                        view === 'month' 
                          ? "bg-[#5C8374] text-white" 
                          : cn(colors.textSecondary, "hover:bg-[#5C8374]/20")
                      )}
                    >
                      <LayoutGrid className="w-4 h-4" />
                      {t('month') || 'Month'}
                    </button>
                  </div>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={fetchEvents}
                    disabled={isRefreshing}
                    className={cn(colors.border, colors.textSecondary)}
                    title={t('refresh') || 'Refresh'}
                  >
                    <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={disconnectCalendar}
                    className={cn(colors.border, "text-red-500 hover:bg-red-500/10")}
                    title={t('disconnect') || 'Disconnect Calendar'}
                  >
                    {t('reconnect') || 'Reconnect'}
                  </Button>

                  <Button
                    onClick={() => openNewEvent()}
                    className="bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {t('newEvent') || 'New Event'}
                  </Button>

                  <Button
                    onClick={() => {
                      setTaskForm(prev => ({ ...prev, due: format(selectedDate, 'yyyy-MM-dd') }));
                      setShowTaskForm(true);
                    }}
                    variant="outline"
                    className={cn(colors.border, "text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20")}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    {t('newTask') || 'New Task'}
                  </Button>
                </div>
              </div>

              {/* Calendar Content */}
              <div className="flex-1 overflow-auto">
                {view === 'month' ? (
                  // Month View
                  <div className="p-4">
                    {/* Week day headers */}
                    <div className="grid grid-cols-7 mb-2">
                      {weekDayNames.map(day => (
                        <div
                          key={day}
                          className={cn("text-center text-sm font-medium py-2", colors.textTertiary)}
                        >
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* Calendar days */}
                    <div className="grid grid-cols-7 gap-1">
                      {calendarDays.map((day, index) => {
                        const dayEvents = getEventsForDate(day);
                        const isCurrentMonth = isSameMonth(day, currentDate);
                        const isToday = isSameDay(day, new Date());
                        const isSelected = isSameDay(day, selectedDate);

                        return (
                          <div
                            key={index}
                            onClick={() => handleDateClick(day)}
                            className={cn(
                              "min-h-[100px] p-1 rounded-lg cursor-pointer transition-all border",
                              isCurrentMonth ? colors.bgPrimary : 'opacity-40',
                              isToday && "ring-2 ring-[#5C8374]",
                              isSelected && "bg-[#5C8374]/20",
                              theme === 'light' ? 'border-gray-200' : 'border-gray-700',
                              "hover:bg-[#5C8374]/10 hover:scale-[1.02]"
                            )}
                          >
                            <div className={cn(
                              "text-sm font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full",
                              isToday ? "bg-[#5C8374] text-white" : colors.textPrimary
                            )}>
                              {format(day, 'd')}
                            </div>
                            <div className="space-y-0.5">
                              {dayEvents.slice(0, 3).map((event, i) => (
                                <div
                                  key={event.id || i}
                                  onClick={(e) => !event.isHoliday && openEditEvent(event, e)}
                                  className={cn(
                                    "text-xs px-1 py-0.5 rounded truncate hover:opacity-80",
                                    event.isHoliday ? "cursor-default italic" : "cursor-pointer",
                                    event.isTask && "border-l-2 border-yellow-400"
                                  )}
                                  style={{ backgroundColor: getEventColor(event), color: '#fff' }}
                                  title={`${event.isHoliday ? '✡️ ' : event.isTask ? '✓ ' : ''}${event.summary}`}
                                >
                                  {event.start?.dateTime && (
                                    <span className="opacity-75 mr-1">
                                      {format(parseISO(event.start.dateTime), 'h:mm')}
                                    </span>
                                  )}
                                  {event.isHoliday && '✡️ '}
                                  {event.isTask && '✓ '}
                                  {event.summary}
                                </div>
                              ))}
                              {dayEvents.length > 3 && (
                                <div className={cn("text-xs", colors.textTertiary)}>
                                  +{dayEvents.length - 3} more
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : view === 'week' ? (
                  // Week View
                  <div className="flex flex-col h-full">
                    {/* Week day headers */}
                    <div className={cn("grid grid-cols-8 border-b sticky top-0 z-10", colors.bgSecondary, colors.border)}>
                      <div className="w-16" />
                      {weekDays.map((day, i) => (
                        <div
                          key={i}
                          onClick={() => { setCurrentDate(day); setView('day'); }}
                          className={cn(
                            "text-center py-2 cursor-pointer hover:bg-[#5C8374]/10 transition-colors",
                            isSameDay(day, new Date()) && "bg-[#5C8374]/20"
                          )}
                        >
                          <div className={cn("text-xs", colors.textTertiary)}>
                            {format(day, 'EEE')}
                          </div>
                          <div className={cn(
                            "text-lg font-semibold w-8 h-8 mx-auto flex items-center justify-center rounded-full",
                            isSameDay(day, new Date()) ? "bg-[#5C8374] text-white" : colors.textPrimary
                          )}>
                            {format(day, 'd')}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Time grid */}
                    <div className="flex-1 overflow-y-auto">
                      <div className="relative">
                        {HOURS.map(hour => (
                          <div key={hour} className={cn("grid grid-cols-8 border-b", colors.border)} style={{ height: `${HOUR_HEIGHT}px` }}>
                            <div className={cn("w-16 text-xs text-right pr-2 pt-1", colors.textTertiary)}>
                              {format(setHours(new Date(), hour), 'h a')}
                            </div>
                            {weekDays.map((day, dayIndex) => {
                              const hourEvents = getEventsForHour(day, hour);
                              return (
                                <div
                                  key={dayIndex}
                                  onClick={() => openNewEvent(day, hour)}
                                  className={cn(
                                    "border-l relative cursor-pointer hover:bg-[#5C8374]/5",
                                    colors.border,
                                    isSameDay(day, new Date()) && "bg-[#5C8374]/5"
                                  )}
                                >
                                  {hourEvents.map((event, i) => (
                                    <div
                                      key={event.id || i}
                                      onClick={(e) => !event.isHoliday && openEditEvent(event, e)}
                                      className={cn(
                                        "absolute left-0 right-1 text-xs px-1 py-0.5 rounded overflow-hidden z-10",
                                        event.isHoliday ? "cursor-default" : "cursor-pointer"
                                      )}
                                      style={{ 
                                        backgroundColor: getEventColor(event), 
                                        color: '#fff',
                                        top: `${getMinutes(parseISO(event.start.dateTime))}px`,
                                        minHeight: '20px'
                                      }}
                                      title={event.summary}
                                    >
                                      <div className="font-medium truncate">
                                        {event.isHoliday && '✡️ '}
                                        {event.isTask && '✓ '}
                                        {event.summary}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  // Day View with drag/resize
                  <div className="flex h-full">
                    {/* Time column */}
                    <div className="w-16 flex-shrink-0">
                      {HOURS.map(hour => (
                        <div key={hour} className={cn("text-xs text-right pr-2 pt-1", colors.textTertiary)} style={{ height: `${HOUR_HEIGHT}px` }}>
                          {format(setHours(new Date(), hour), 'h a')}
                        </div>
                      ))}
                    </div>

                    {/* Day column */}
                    <div 
                      ref={dayColumnRef}
                      className="flex-1 relative border-l" 
                      style={{ borderColor: theme === 'light' ? '#e2e8f0' : '#5C8374' }}
                    >
                      {/* Hour lines */}
                      {HOURS.map(hour => (
                        <div
                          key={hour}
                          onClick={() => openNewEvent(currentDate, hour)}
                          className={cn(
                            "border-b cursor-pointer hover:bg-[#5C8374]/5",
                            colors.border
                          )}
                          style={{ height: `${HOUR_HEIGHT}px` }}
                        />
                      ))}

                      {/* Events with drag/resize */}
                      <div className="absolute inset-0 pointer-events-none">
                        {getEventsForDate(currentDate)
                          .filter(event => event.start?.dateTime)
                          .map((event, i) => (
                            <div key={event.id || i} className="pointer-events-auto">
                              {renderDayViewEvent(event, i)}
                            </div>
                          ))}
                      </div>

                      {/* All-day events */}
                      {getEventsForDate(currentDate).filter(e => e.start?.date).length > 0 && (
                        <div className={cn("absolute top-0 left-0 right-0 p-2 border-b z-20", colors.bgSecondary, colors.border)}>
                          <div className={cn("text-xs font-medium mb-1", colors.textTertiary)}>All-day</div>
                          {getEventsForDate(currentDate)
                            .filter(e => e.start?.date)
                            .map((event, i) => (
                              <div
                                key={event.id || i}
                                onClick={(e) => !event.isHoliday && openEditEvent(event, e)}
                                className={cn(
                                  "text-xs px-2 py-1 rounded mb-1",
                                  event.isHoliday ? "cursor-default italic" : "cursor-pointer"
                                )}
                                style={{ backgroundColor: getEventColor(event), color: '#fff' }}
                              >
                                {event.isHoliday && '✡️ '}
                                {event.isTask && '✓ '}
                                {event.summary}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Hint text */}
              {view === 'day' && (
                <div className={cn("px-4 py-2 text-xs border-t", colors.border, colors.textTertiary)}>
                  💡 Tip: Drag events to move them, drag the bottom edge to resize. Click empty time slots to create new events.
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
