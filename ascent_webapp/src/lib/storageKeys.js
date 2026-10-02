// localStorage keys shared by the API client and the session code
// Where app builds before the session cookie kept the token; read once to move the device over
export const LEGACY_TOKEN_KEY = 'ascent_access_token';
// Only a hint that this device has a session (the session itself is an HttpOnly cookie scripts cannot read)
export const SIGNED_IN_KEY = 'ascent_signed_in';
export const WORKSPACE_KEY = 'ascent_current_workspace_id';
export const SESSION_CACHE_KEY = 'ascent_cached_session';
// The sign-in page's language picker (the visitor is not signed in yet)
export const LOGIN_LANG_KEY = 'ascent_login_lang';
// The Google Calendar access token (an hour long) and when it runs out; removed on sign-out
export const CALENDAR_TOKEN_KEY = 'googleCalendarToken';
export const CALENDAR_EXPIRY_KEY = 'googleCalendarTokenExpiry';
