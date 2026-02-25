// API Configuration and Utility Functions

const API_BASE_URL = '/api';

// Get stored auth token
export const getToken = () => {
    const tokenData = localStorage.getItem('shiftsync_token');
    return tokenData;
};

// Set auth token
export const setToken = (token) => {
    localStorage.setItem('shiftsync_token', token);
};

// Remove auth token
export const removeToken = () => {
    localStorage.removeItem('shiftsync_token');
};

// API request helper with authentication
// API request helper with authentication
const apiRequest = async (endpoint, options = {}) => {
    const token = getToken();

    const config = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers,
        },
    };

    try {
        const timestamp = Date.now();
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `${API_BASE_URL}${endpoint}${separator}_t=${timestamp}`;

        const response = await fetch(url, config);

        // Handle 204 No Content specifically
        if (response.status === 204) {
            return null;
        }

        const contentType = response.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
            try {
                data = await response.json();
            } catch (e) {
                console.error(`Failed to parse JSON from ${url}`, e);
                throw new Error('Invalid JSON response from server');
            }
        } else {
            // If not JSON, try to read text for error message
            const text = await response.text();
            if (!response.ok) {
                throw new Error(text || `HTTP error! status: ${response.status}`);
            }
            // If success but not JSON? Probably shouldn't happen in this API, but return text
            return text;
        }

        if (!response.ok) {
            const error = new Error(data.error || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            throw error;
        }

        return data;
    } catch (error) {
        console.error(`API Request Failed: ${url}`, error);
        throw error;
    }
};

// Auth API
export const authAPI = {
    login: async (email, password) => {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });

        if (data.success && data.token) {
            setToken(data.token);
        }

        return data;
    },

    getCurrentUser: async () => {
        return apiRequest('/auth/me');
    },

    logout: () => {
        removeToken();
        localStorage.removeItem('shiftsync_user');
    }
};

// Employees API
export const employeesAPI = {
    getAll: async (storeId) => {
        const params = storeId ? `?storeId=${storeId}` : '';
        return apiRequest(`/employees${params}`);
    },

    getById: async (id) => {
        return apiRequest(`/employees/${id}`);
    },

    getChatContacts: async () => {
        return apiRequest('/employees/chat-contacts');
    },

    create: async (employeeData) => {
        return apiRequest('/employees', {
            method: 'POST',
            body: JSON.stringify(employeeData),
        });
    },

    update: async (id, employeeData) => {
        return apiRequest(`/employees/${id}`, {
            method: 'PUT',
            body: JSON.stringify(employeeData),
        });
    },

    delete: async (id) => {
        return apiRequest(`/employees/${id}`, {
            method: 'DELETE',
        });
    }
};

// Schedules API
export const schedulesAPI = {
    get: async (storeId, weekStart) => {
        let url = `/schedules?storeId=${storeId}`;
        if (weekStart) {
            url += `&weekStart=${weekStart}`;
        }
        return apiRequest(url);
    },

    save: async (scheduleData) => {
        return apiRequest('/schedules', {
            method: 'POST',
            body: JSON.stringify(scheduleData),
        });
    },

    publish: async (id, published) => {
        return apiRequest(`/schedules/${id}/publish`, {
            method: 'POST',
            body: JSON.stringify({ published }),
        });
    },

    getPublishedWeeks: async (storeId) => {
        return apiRequest(`/schedules/published-weeks?storeId=${storeId}`);
    },

    getEmployeePublishedShifts: async (storeId, employeeId) => {
        return apiRequest(`/schedules/employee/${employeeId}/published-shifts?storeId=${storeId}`);
    }
};

// Requests API (Time Off)
export const requestsAPI = {
    getAll: async (params) => {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/requests?${query}`);
    },

    create: async (requestData) => {
        return apiRequest('/requests', {
            method: 'POST',
            body: JSON.stringify(requestData),
        });
    },

    updateStatus: async (id, updates) => {
        return apiRequest(`/requests/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates),
        });
    },

    getEligibleReplacements: async (id) => {
        return apiRequest(`/requests/${id}/eligible-replacements`);
    },

    delete: async (id) => {
        return apiRequest(`/requests/${id}`, {
            method: 'DELETE',
        });
    },

    notifyReplacements: async (id) => {
        return apiRequest(`/requests/${id}/notify-replacements`, {
            method: 'POST',
        });
    },

    assignReplacement: async (id, replacementId) => {
        return apiRequest(`/requests/${id}/assign-replacement`, {
            method: 'POST',
            body: JSON.stringify({ replacementId }),
        });
    }
};

// Messages API (Chat)
export const messagesAPI = {
    getConversations: async () => {
        return apiRequest('/messages/conversations');
    },

    createConversation: async (data) => {
        return apiRequest('/messages/conversations', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    getMessages: async (conversationId, params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/messages/conversations/${conversationId}/messages?${query}`);
    },

    sendMessage: async (conversationId, content) => {
        return apiRequest(`/messages/conversations/${conversationId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content }),
        });
    }
};

// Notifications API
export const notificationsAPI = {
    getAll: async (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/notifications?${query}`);
    },

    getUnreadCount: async () => {
        return apiRequest('/notifications/unread-count');
    },

    getVapidPublicKey: async () => {
        return apiRequest('/notifications/vapid-public-key');
    },

    subscribe: async (subscription) => {
        return apiRequest('/notifications/subscribe', {
            method: 'POST',
            body: JSON.stringify(subscription),
        });
    },

    markAsRead: async (id) => {
        return apiRequest(`/notifications/${id}/read`, {
            method: 'PUT',
        });
    },

    markAllAsRead: async () => {
        return apiRequest('/notifications/mark-all-read', {
            method: 'PUT',
        });
    },

    delete: async (id) => {
        return apiRequest(`/notifications/${id}`, {
            method: 'DELETE',
        });
    }
};

// Health check
export const checkAPIHealth = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        return response.ok;
    } catch {
        return false;
    }
};

// Backups API (Admin only)
export const backupsAPI = {
    getConfig: async () => {
        return apiRequest('/admin/backups/config');
    },

    updateConfig: async (schedule) => {
        return apiRequest('/admin/backups/config', {
            method: 'POST',
            body: JSON.stringify({ schedule }),
        });
    },

    getList: async () => {
        return apiRequest('/admin/backups/list');
    },

    create: async () => {
        return apiRequest('/admin/backups/create', {
            method: 'POST',
        });
    },

    restore: async (filename) => {
        return apiRequest('/admin/backups/restore', {
            method: 'POST',
            body: JSON.stringify({ filename }),
        });
    }
};

// Stores API (Admin only)
export const storesAPI = {
    getAll: async () => {
        return apiRequest('/stores');
    },

    getById: async (id) => {
        return apiRequest(`/stores/${id}`);
    },

    create: async (storeData) => {
        return apiRequest('/stores', {
            method: 'POST',
            body: JSON.stringify(storeData),
        });
    },

    update: async (id, storeData) => {
        return apiRequest(`/stores/${id}`, {
            method: 'PUT',
            body: JSON.stringify(storeData),
        });
    },

    delete: async (id) => {
        return apiRequest(`/stores/${id}`, {
            method: 'DELETE',
        });
    }
};

export default {
    auth: authAPI,
    employees: employeesAPI,
    schedules: schedulesAPI,
    requests: requestsAPI,
    messages: messagesAPI,
    notifications: notificationsAPI,
    backups: backupsAPI,
    stores: storesAPI,
    checkHealth: checkAPIHealth
};

