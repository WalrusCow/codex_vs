'use strict';

const wcl_client_id = '9617066c-1a8b-490a-9442-1a50fc962f97';
const wcl_auth_uri = 'https://www.warcraftlogs.com/oauth/authorize';
const wcl_tok_uri = 'https://www.warcraftlogs.com/oauth/token';
const redirect_uri = 'https://walruscow.github.io/codex_vs/';

async function s256(codeVerifier) {
  const digest = await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(codeVerifier));

  return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-~.';

  let text = '';
  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}

class AuthButton extends React.Component {
  constructor(props) {
    super(props);
    const args = new URLSearchParams(window.location.search);
    let code = args.get('code');
    if (code !== null) {
      // we can use code to get a token
      this.getAccessToken(code);
    }
    this.state = { liked: false };
  }

  async getAccessToken(code) {
    let xhr = new XMLHttpRequest();
    xhr.onload = function() {
      let response = xhr.response;
      if (xhr.status != 200) {
        console.log(`Error trying to get access token: ${response.error}. ${response.message}`);
      }
      window.sessionStorage.setItem('auth_token', response.access_token);
      console.log('response is ', response);
    };
    xhr.responseType = 'json';
    xhr.open('POST', wcl_tok_uri, true);
    xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    xhr.send(new URLSearchParams({
      client_id: wcl_client_id,
      code_verifier: window.sessionStorage.getItem('verifier'),
      redirect_uri: redirect_uri,
      grant_type: 'authorization_code',
      code: code,
    }));
  }

  async flub() {
    const verifier = generateRandomString(128);
    const enc_verifier = await s256(verifier);
    window.sessionStorage.setItem('verifier', verifier);

    const args = new URLSearchParams({
      client_id: wcl_client_id,
      code_challenge: enc_verifier,
      code_challenge_method: 'S256',
      redirect_uri: redirect_uri,
      response_type: 'code',
    });
    console.log('goodbye');
    window.location = wcl_auth_uri + '/?' + args;
  }

  render() {
    if (this.state.liked) {
      return 'You liked this.';
    }

    return <button onClick={this.flub}>Start Auth</button>;
  }
}


const domContainer = document.querySelector('#root');
const root = ReactDOM.createRoot(domContainer);
root.render(<AuthButton/>);
