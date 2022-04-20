'use strict';

const wcl_client_id = '9617066c-1a8b-490a-9442-1a50fc962f97';
const wcl_auth_uri = 'https://www.warcraftlogs.com/oauth/authorize';
const wcl_tok_uri = 'https://www.warcraftlogs.com/oauth/token';
const redirect_uri = 'https://walruscow.github.io/codex_vs/';

async function s256(codeVerifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-~.';
  let text = '';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}

function getRedirectCodeOrNull() {
  const code = new URLSearchParams(window.location.search).get('code'); // We need the verifier data to use the auth code anyway

  return window.sessionStorage.getItem('verifier') ? code : null;
}

function getAuthTokenOrNull() {
  return window.sessionStorage.getItem('verifier') ? window.sessionStorage.getItem('auth_token') : null;
}

async function redirectForAuth() {
  const verifier = generateRandomString(128);
  const enc_verifier = await s256(verifier);
  window.sessionStorage.setItem('verifier', verifier);
  const args = new URLSearchParams({
    client_id: wcl_client_id,
    code_challenge: enc_verifier,
    code_challenge_method: 'S256',
    redirect_uri: redirect_uri,
    response_type: 'code'
  });
  window.location = wcl_auth_uri + '/?' + args;
}

async function getAuthToken(code) {
  const response = await fetch(wcl_tok_uri, {
    method: 'POST',
    mode: 'cors',
    cache: 'no-cache',
    body: new URLSearchParams({
      client_id: wcl_client_id,
      code_verifier: window.sessionStorage.getItem('verifier'),
      redirect_uri: redirect_uri,
      grant_type: 'authorization_code',
      code: code
    })
  });
  const j = await response.json();

  if (!j.access_token || !response.ok) {
    window.sessionStorage.removeItem('auth_token');
  } else {
    window.sessionStorage.setItem('auth_token', j.access_token);
  } // Remove code from url, so that it's safely copyable


  let params = new URLSearchParams(window.location.search);
  params.delete('code');
  history.replaceState({}, '', window.location.origin + window.location.pathname + params);
  return j.access_token;
}

export { getRedirectCodeOrNull, getAuthTokenOrNull, redirectForAuth, getAuthToken };