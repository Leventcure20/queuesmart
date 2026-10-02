/* Temporary frontend demo data. Replace with assignment-specific data later. */
window.QueueSmartData = {
  currentUser: { name: 'Jordan Lee', role: 'Staff', initials: 'JL' },
  stats: { waiting: 12, serving: 3, completed: 48, averageWait: 14 },
  services: [
    { id: 'S-01', name: 'General Inquiry', description: 'Questions and account support', wait: 12, status: 'Open' },
    { id: 'S-02', name: 'Billing & Payments', description: 'Payments, invoices, and refunds', wait: 18, status: 'Open' },
    { id: 'S-03', name: 'Technical Support', description: 'Product and technical help', wait: 24, status: 'Open' }
  ],
  tickets: [
    { number: 'A024', customer: 'Morgan Chen', service: 'General Inquiry', joined: '10:42 AM', wait: '8 min', status: 'Waiting' },
    { number: 'A023', customer: 'Alex Rivera', service: 'Billing & Payments', joined: '10:37 AM', wait: '13 min', status: 'Waiting' },
    { number: 'A022', customer: 'Sam Patel', service: 'Technical Support', joined: '10:29 AM', wait: '21 min', status: 'Serving' },
    { number: 'A021', customer: 'Taylor Brooks', service: 'General Inquiry', joined: '10:18 AM', wait: 'Completed', status: 'Completed' }
  ]
};
/* Keep demo edits across refreshes; clear QueueSmartDemo in devtools to reset. */
try {
  const saved = JSON.parse(localStorage.getItem('QueueSmartDemo') || '{}');
  if (Array.isArray(saved.services)) window.QueueSmartData.services = saved.services;
  if (Array.isArray(saved.tickets)) window.QueueSmartData.tickets = saved.tickets;
  window.QueueSmartData.save = () => localStorage.setItem('QueueSmartDemo', JSON.stringify({ services: window.QueueSmartData.services, tickets: window.QueueSmartData.tickets }));
} catch (_) {
  window.QueueSmartData.save = () => {};
}
