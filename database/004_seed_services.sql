INSERT INTO "Service" (id, name, description, expected_duration, priority_level)
VALUES
  ('S-01', 'General Inquiry', 'Questions and account support', 8, 'medium'),
  ('S-02', 'Billing & Payments', 'Payments, invoices, and refunds', 12, 'medium'),
  ('S-03', 'Technical Support', 'Product and technical help', 20, 'high')
ON CONFLICT (id) DO NOTHING;
