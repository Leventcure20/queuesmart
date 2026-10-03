/* Public, browser-safe configuration only. Never place a client secret here. */
window.QueueSmartConfig = {
  googleClientId: "", // Set your Google OAuth 2.0 Web client ID to enable the button.
  googleAuthEndpoint: "/api/auth/google", // Backend endpoint must verify Google's ID token.
};
