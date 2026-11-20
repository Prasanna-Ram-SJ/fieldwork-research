const messages: Record<string, string> = {
  oauth_exchange_failed: 'Google sign-in could not finish. Start again using Continue with Google.',
  session_expired: 'This sign-in link expired or was already used. Start a new sign-in from this page.',
  session_storage: 'The browser could not match this sign-in to your request. Start again in this same browser at the same website address, with cookies allowed.',
  oauth_denied: 'Google sign-in was cancelled or access was declined. You can try again.',
  oauth_config: 'Google sign-in needs a configuration correction. Please report this message to the site owner.',
  provider_disabled: 'Google sign-in is not enabled for this site yet.',
  signup_disabled: 'New account registration is currently closed. Existing accounts can still sign in.',
  account_creation_failed: 'Google returned successfully, but the site could not create your account. Please report this message to the site owner.',
  auth_unavailable: 'The sign-in service could not be reached. Check your connection and try again.',
  auth_not_configured: 'Sign-in is not configured for this site yet.',
};

export function authErrorMessage(code: string) {
  return Object.hasOwn(messages, code) ? messages[code] : messages.oauth_exchange_failed;
}

// Classify failures without reflecting provider details, tokens or URLs.
export function authErrorCode(error: unknown): string {
  const e = error as { code?: string; message?: string; name?: string } | null;
  const code = String(e?.code || '').toLowerCase();
  const message = String(e?.message || '').toLowerCase();
  if (code === 'access_denied') return 'oauth_denied';
  if (code === 'signup_disabled') return 'signup_disabled';
  if (code === 'provider_disabled') return 'provider_disabled';
  if (['bad_code_verifier', 'flow_state_not_found'].includes(code) || /code.?verifier|pkce/.test(message)) return 'session_storage';
  if (['flow_state_expired', 'otp_expired', 'invalid_grant'].includes(code) || /expired|already.*used/.test(message)) return 'session_expired';
  if (/database error saving new user/.test(message)) return 'account_creation_failed';
  if (/redirect_uri_mismatch|invalid_client|oauth.*config/.test(code + ' ' + message)) return 'oauth_config';
  if (e?.name === 'TypeError' || /fetch failed|network|timeout/.test(message)) return 'auth_unavailable';
  return 'oauth_exchange_failed';
}
