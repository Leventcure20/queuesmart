/* Client-side API adapter for the QueueSmart frontend prototype. */
window.QueueSmartApi = {
  demo: true,
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
      number: `A${String(highestTicketNumber + 1).padStart(3, "0")}`,
      customer: customerName,
      service: service.name,
      joined: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      wait: `${service.wait} min`,
      status: "Waiting",
    };
    window.QueueSmartData.tickets.unshift(ticket);
    window.QueueSmartData.save?.();
    return ticket;
  },
};
