import axios from 'axios';

// Clean up localStorage on load
const cleanupLocalStorage = () => {
  try {
    // Validate and clean user data only; keep cache keys for faster page loads.
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (!user.id || !user.email) {
          localStorage.removeItem('user');
        }
      } catch {
        localStorage.removeItem('user');
      }
    }
  } catch (error) {
    console.warn('LocalStorage cleanup failed:', error);
  }
};

// Run cleanup on import
cleanupLocalStorage();

// API base configuration
const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? '/api'
  : '/api';

// Create axios instance with minimal headers
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
});

const responseCache = new Map();
const inflightRequests = new Map();

const buildCacheKey = (url, config = {}) => {
  const params = config?.params ? JSON.stringify(config.params) : '';
  return `${url}::${params}`;
};

const clearGetCache = () => {
  responseCache.clear();
  inflightRequests.clear();
};

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Remove any potentially large headers
    delete config.headers['User-Agent'];
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

const originalGet = api.get.bind(api);
const originalPost = api.post.bind(api);
const originalPut = api.put.bind(api);
const originalDelete = api.delete.bind(api);
const originalPatch = api.patch.bind(api);

api.get = (url, config = {}) => {
  const useCache = config.cache !== false;
  const cacheTTL = Number(config.cacheTTL ?? 10000);
  if (!useCache || cacheTTL <= 0) {
    return originalGet(url, config);
  }

  const key = buildCacheKey(url, config);
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.response);
  }

  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const promise = originalGet(url, config)
    .then((response) => {
      responseCache.set(key, {
        expiresAt: Date.now() + cacheTTL,
        response
      });
      return response;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, promise);
  return promise;
};

api.post = (...args) => originalPost(...args).then((res) => {
  clearGetCache();
  return res;
});
api.put = (...args) => originalPut(...args).then((res) => {
  clearGetCache();
  return res;
});
api.delete = (...args) => originalDelete(...args).then((res) => {
  clearGetCache();
  return res;
});
api.patch = (...args) => originalPatch(...args).then((res) => {
  clearGetCache();
  return res;
});

export default api;
