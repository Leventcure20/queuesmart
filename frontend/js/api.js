/* QueueSmart API adapter. Auth, services, and queue records come from the backend. */
const QUEUESMART_API_ROOT = "http://localhost:3000/api";
const AUTH_STORAGE_KEY = "QueueSmartAuth";

function readAuthSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

async function apiRequest(path, options = {}) {
  const session = readAuthSession();
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  if (session?.token) headers.Authorization = "Bearer " + session.token;

  let response;
  try {
    response = await fetch(QUEUESMART_API_ROOT + path, { ...options, headers });
  } catch {
    throw new Error("Could not reach the backend. Make sure it is running on port 3000.");
  }

  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result?.error || "The request failed.");
  return result;
}

function mapService(service) {
  return {
    ...service,
    duration: service.expectedDuration,
    wait: service.expectedDuration,
    priority: service.priorityLevel,
    status: "Open",
  };
}

function formatWait(seconds) {
  const totalSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return minutes
    ? `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`
    : `${remainingSeconds}s`;
}

function mapTicket(ticket) {
  const joinedAt = new Date(ticket.joinedAt);
  const statuses = { waiting: "Waiting", cancelled: "Cancelled", serving: "Serving", served: "Completed" };
  return {
    ...ticket,
    customer: ticket.customerName,
    service: ticket.serviceName,
    joined: joinedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    joinedDate: joinedAt.toLocaleDateString([], { month: "short", day: "numeric" }),
    wait: ticket.estimatedWaitSeconds == null ? "—" : formatWait(ticket.estimatedWaitSeconds),
    status: statuses[ticket.status] || ticket.status,
  };
}

window.QueueSmartApi = {
  async register({ name, email, password }) {
    return apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  },
  async login({ email, password }) {
    return apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  async getCurrentUser() {
    const result = await apiRequest("/auth/me");
    return result.user;
  },
  async logout() {
    return apiRequest("/auth/logout", { method: "POST" });
  },
  async getServices() {
    const result = await apiRequest("/services");
    return result.services.map(mapService);
  },
  async getTickets() {
    const session = readAuthSession();
    const endpoint = session?.user?.role === "admin"
      ? "/queue/tickets"
      : "/queue/my-tickets";
    const result = await apiRequest(endpoint);
    return result.tickets.map(mapTicket);
  },
  async getNotifications() {
    const result = await apiRequest("/queue/notifications");
    return result.notifications;
  },
  async getTicket(ticketId) {
    const result = await apiRequest("/queue/tickets/" + encodeURIComponent(ticketId));
    return mapTicket(result.ticket);
  },
  async joinQueue(serviceId) {
    const result = await apiRequest("/queue/tickets", {
      method: "POST",
      body: JSON.stringify({ serviceId }),
    });
    return mapTicket(result.ticket);
  },
  async leaveQueue(ticketId) {
    const result = await apiRequest("/queue/tickets/" + encodeURIComponent(ticketId), {
      method: "DELETE",
    });
    return mapTicket(result.ticket);
  },
  async createService(service) {
    const result = await apiRequest("/services", {
      method: "POST",
      body: JSON.stringify(service),
    });
    return mapService(result.service);
  },
  async updateService(id, changes) {
    const result = await apiRequest("/services/" + encodeURIComponent(id), {
      method: "PUT",
      body: JSON.stringify(changes),
    });
    return mapService(result.service);
  },
};
