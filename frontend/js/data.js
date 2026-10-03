/* Example records used by the QueueSmart frontend prototype. */
window.QueueSmartData = {
  currentUser: { name: 'Jordan Lee', role: 'Staff', initials: 'JL' },
  stats: { waiting: 12, serving: 3, completed: 48, servedToday: 18, averageWait: 14 },
  notifications: {
    users: [
      { title: 'Queue status update', detail: 'Ticket A024 is almost ready.', time: '2 min ago', type: 'status' },
      { title: 'Estimated wait updated', detail: 'General Inquiry is about 12 minutes.', time: '10 min ago', type: 'wait' }
    ],
    admins: [
      { title: 'Queue length changed', detail: 'Billing & Payments has 4 people waiting.', time: '2 min ago', type: 'queue' },
      { title: 'Service status changed', detail: 'Technical Support is closed to new customers.', time: '8 min ago', type: 'status' }
    ]
  },
  services: [
    { id: 'S-01', name: 'General Inquiry', description: 'Questions and account support', duration: 8, wait: 12, status: 'Open' },
    { id: 'S-02', name: 'Billing & Payments', description: 'Payments, invoices, and refunds', duration: 12, wait: 18, status: 'Open' },
    { id: 'S-03', name: 'Technical Support', description: 'Product and technical help', duration: 20, wait: 24, status: 'Open' }
  ],
  tickets: [
    { number: 'A024', customer: 'Morgan Chen', service: 'General Inquiry', joined: '10:42 AM', wait: '8 min', status: 'Waiting' },
    { number: 'A023', customer: 'Alex Rivera', service: 'Billing & Payments', joined: '10:37 AM', wait: '13 min', status: 'Waiting' },
    { number: 'A022', customer: 'Sam Patel', service: 'Technical Support', joined: '10:29 AM', wait: '21 min', status: 'Serving' },
    { number: 'A021', customer: 'Taylor Brooks', service: 'General Inquiry', joined: '10:18 AM', wait: 'Completed', status: 'Completed' }
  ]
};
/* Persist local prototype changes between page refreshes. */
try {
  const saved = JSON.parse(localStorage.getItem('QueueSmartDemo') || '{}');
  if (Array.isArray(saved.services)) window.QueueSmartData.services = saved.services;
  window.QueueSmartData.services.forEach(service => { if (!service.duration) service.duration = service.wait || 10; });
  if (Array.isArray(saved.tickets)) window.QueueSmartData.tickets = saved.tickets;
  window.QueueSmartData.save = () => localStorage.setItem('QueueSmartDemo', JSON.stringify({ services: window.QueueSmartData.services, tickets: window.QueueSmartData.tickets }));
} catch (_) {
  window.QueueSmartData.save = () => {};
}
