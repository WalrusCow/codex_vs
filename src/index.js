'use strict';

const wcl_client_id = '9617066c-1a8b-490a-9442-1a50fc962f97';
const wcl_auth_uri = 'https://www.warcraftlogs.com/oauth/authorize';
const wcl_tok_uri = 'https://www.warcraftlogs.com/oauth/token';

async function s256(codeVerifier) {
  const digest = await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(codeVerifier));

  return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function generateRandomString(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-~.';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}

class AuthButton extends React.Component {
  constructor(props) {
    super(props);
    this.state = { liked: false };
  }

  async flub() {

    const verifier = generateRandomString(128);
    const enc_verifier = await s256(verifier);
    window.sessionStorage.setItem('verifier', verifier);

    const args = new URLSearchParams({
      client_id: wcl_client_id,
      code_challenge: enc_verifier,
      code_challenge_method: 'S256',
      state: generateRandomString(30),
      redirect_uri: 'https://walruscow.github.io/codex_vs/',
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
