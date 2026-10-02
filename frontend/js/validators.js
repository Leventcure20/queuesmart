window.QueueSmartValidators = {
  required(value, label = 'This field') { return String(value || '').trim() ? '' : `${label} is required.`; },
  email(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()) ? '' : 'Enter a valid email address.'; },
  password(value) { return String(value || '').length >= 8 ? '' : 'Use at least 8 characters.'; }
};
