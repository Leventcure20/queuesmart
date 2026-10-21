/* Frontend API adapter. Auth uses the backend; queue data remains a local demo. */
const QUEUESMART_API_ROOT = "http://localhost:3000/api";
const AUTH_STORAGE_KEY = "QueueSmartAuth";

function readAuthSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

async function authRequest(path, options = {}) {
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

window.QueueSmartApi = {
  demo: true,
  async register({ name, email, password }) {
    return authRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  },
  async login({ email, password }) {
    return authRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  async getCurrentUser() {
    const result = await authRequest("/auth/me");
    return result.user;
  },
  async logout() {
    return authRequest("/auth/logout", { method: "POST" });
  },
  async getServices() {
    return window.QueueSmartData.services;
  },
  async getTickets() {
    return window.QueueSmartData.tickets;
  },
  async getStats() {
    return window.QueueSmartData.stats;
  },
  async joinQueue(serviceId, customerName) {
    const service = window.QueueSmartData.services.find(
      (item) => item.id === serviceId,
    );
    if (!service || service.status !== "Open")
      throw new Error("Please choose an available service.");
    const highestTicketNumber = window.QueueSmartData.tickets.reduce(
      (highest, ticket) =>
        Math.max(highest, Number(String(ticket.number).replace(/\D/g, "")) || 0),
      24,
    );
    const ticket = {
      number: "A" + String(highestTicketNumber + 1).padStart(3, "0"),
      customer: customerName,
      service: service.name,
      joined: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      wait: service.wait + " min",
      status: "Waiting",
    };
    window.QueueSmartData.tickets.unshift(ticket);
    window.QueueSmartData.save?.();
    return ticket;
  },
};
