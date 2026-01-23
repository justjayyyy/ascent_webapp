// App Parameters - Simplified for custom backend

function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function getAppParamValue(paramName, options = {}) {
  const { defaultValue } = options;
  const storageKey = `ascent_${toSnakeCase(paramName)}`;
  
  // Check URL params
  const urlParams = new URLSearchParams(window.location.search);
  const urlValue = urlParams.get(paramName);
  if (urlValue) {
    return urlValue;
  }
  
  // Check localStorage
  const storedValue = localStorage.getItem(storageKey);
  if (storedValue) {
    return storedValue;
  }
  
  return defaultValue;
}

export function clearAuthToken() {
  localStorage.removeItem('ascent_access_token');
}

export const appParams = {
  apiUrl: getAppParamValue("api_url", { defaultValue: import.meta.env.VITE_API_URL || '/api' }),
  token: localStorage.getItem('ascent_access_token')
};
