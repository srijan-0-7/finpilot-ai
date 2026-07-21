import axios from 'axios';

// Same-origin by default (FastAPI serves this build directly), but falls
// back to localhost:8000 for local `npm run dev` where the Vite dev server
// runs on a different port than the API.
const baseURL = window.location.port === '5173'
  ? 'http://localhost:8000/api/v1'
  : '/api/v1';

const TOKEN_KEY = 'finpilot_auth_token';

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);
export const setStoredToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearStoredToken = () => localStorage.removeItem(TOKEN_KEY);

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach the session token to every request.
api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the session is invalid/expired, clear it so the login screen shows
// again on next reload rather than silently failing forever.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearStoredToken();
    }
    return Promise.reject(error);
  }
);

// --- Auth ---

export const signup = async (email: string, password: string) => {
  const response = await axios.post(`${baseURL}/auth/signup`, { email, password });
  setStoredToken(response.data.token);
  return response.data;
};

export const login = async (email: string, password: string) => {
  const response = await axios.post(`${baseURL}/auth/login`, { email, password });
  setStoredToken(response.data.token);
  return response.data;
};

export const demoLogin = async (accessKey: string) => {
  const response = await axios.post(`${baseURL}/auth/demo-login`, { access_key: accessKey });
  setStoredToken(response.data.token);
  return response.data;
};

export const getMe = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

export const changePassword = async (currentPassword: string, newPassword: string) => {
  const response = await api.post('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return response.data;
};

export const logout = async () => {
  try {
    await api.post('/auth/logout');
  } finally {
    clearStoredToken();
  }
};

export const trackVisit = async () => {
  try {
    await axios.post(`${baseURL}/track-visit`);
  } catch {
    // best-effort, never block the app on this
  }
};

// --- Chat ---

export const askFinPilot = async (query: string) => {
  const response = await api.post('/ask', { query });
  return response.data;
};

export const executeMutation = async (sql: string, operationType: string) => {
  const response = await api.post('/execute-mutation', { sql, operation_type: operationType });
  return response.data;
};

// --- Dashboard ---

export const getDashboard = async () => {
  const response = await api.get('/dashboard');
  return response.data;
};

export const getDashboardConfigs = async () => {
  const response = await api.get('/dashboard-configs');
  return response.data;
};

export const setDashboardConfig = async (config: {
  table_name: string;
  date_col?: string | null;
  amount_col: string;
  category_col?: string | null;
  entity_col?: string | null;
  label?: string;
}) => {
  const response = await api.post('/dashboard-config', config);
  return response.data;
};

// --- Schema / tables ---

export const getSchema = async () => {
  const response = await api.get('/schema');
  return response.data;
};

export const deleteTable = async (tableName: string) => {
  const response = await api.delete(`/schema/${encodeURIComponent(tableName)}`);
  return response.data;
};

export const uploadCsv = async (files: File[]) => {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  const response = await api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const getUploadedTables = async () => {
  const response = await api.get('/uploaded-tables');
  return response.data;
};

// --- Relationships ---

export const getRelationships = async () => {
  const response = await api.get('/relationships');
  return response.data;
};

export const createRelationship = async (tableA: string, columnA: string, tableB: string, columnB: string) => {
  const response = await api.post('/relationships', {
    table_a: tableA, column_a: columnA, table_b: tableB, column_b: columnB,
  });
  return response.data;
};

export const deleteRelationship = async (relId: string) => {
  const response = await api.delete(`/relationships/${relId}`);
  return response.data;
};

// --- Excel / Report ---

export const exportToExcel = async (sql: string) => {
  const response = await api.post('/export', { sql }, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'finpilot_export.xlsx');
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const downloadReport = async () => {
  const response = await api.get('/report', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'finpilot_report.pdf');
  document.body.appendChild(link);
  link.click();
  link.remove();
};

// --- History ---

export const getHistory = async () => {
  const response = await api.get('/history');
  return response.data;
};

export const clearHistory = async () => {
  const response = await api.delete('/history');
  return response.data;
};

// --- Explain / correlations / forecast / share ---

export const explainChart = async (chartTitle: string, data: any[]) => {
  const response = await api.post('/explain-chart', { chart_title: chartTitle, data });
  return response.data;
};

export const getCorrelations = async (tableName?: string) => {
  const response = await api.get('/correlations', { params: tableName ? { table_name: tableName } : {} });
  return response.data;
};

export const getForecast = async (tableName?: string, dateCol?: string, valueCol?: string, periods = 3) => {
  const response = await api.post('/forecast', {
    table_name: tableName, date_col: dateCol, value_col: valueCol, periods,
  });
  return response.data;
};

export const createShare = async (title: string, payload: any) => {
  const response = await api.post('/share', { title, payload });
  return response.data;
};

export const getSharedResult = async (shareId: string) => {
  const response = await api.get(`/share/${shareId}`);
  return response.data;
};
