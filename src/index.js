'use strict';

const wcl_client_id = '9617066c-1a8b-490a-9442-1a50fc962f97';
const wcl_auth_uri = 'https://www.warcraftlogs.com/oauth/authorize';
const wcl_tok_uri = 'https://www.warcraftlogs.com/oauth/token';
const redirect_uri = 'https://walruscow.github.io/codex_vs/';
const wcl_api = 'https://www.warcraftlogs.com/api/v2/client'

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

function getRedirectCodeOrNull() {
  //return '';
  const code = (new URLSearchParams(window.location.search)).get('code');
  // We need the verifier data to use the auth code anyway
  return window.sessionStorage.getItem('verifier') ? code : null;
}

function getAuthTokenOrNull() {
  return window.sessionStorage.getItem('verifier') ? window.sessionStorage.getItem('auth_token') : null;
}

function parseReportUrl(url) {
  let result = {
    report_id: null,
    fight_id: null,
    player_id: null,
  };
  try {
    url = new URL(url);
  } catch (err) {
    return result;
  }

  if (!url.pathname.startsWith('/reports/')) {
    return result;
  }
  result.report_id = url.pathname.substr('/reports/'.length);
  if (url.hash) {
    // Strip leading # from hash
    let params = new URLSearchParams(url.hash.substr(1));
    // TODO: Will have to special case handle "last" later
    result.fight_id = params.get('fight');
    // TODO: result.player_id = params.get('source');
  }
  return result;
}

async function wcl_query(auth_token, query, vars) {
  const res = await fetch(wcl_api, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: query,
      variables: vars,
      operationName: null,
    }),
  });
  const json_body = await res.json();
  if (json_body.error) {
    throw new Error(`Error querying WCL API: ${json_body.error}`)
  }
  if (!res.ok) {
    throw new Error(`error querying WCL API: ${res.status}`);
  }
  return json_body.data;
}

async function list_fights(auth_token, report_id) {
  const query = `
    query getFights($report_id: String!) {
     reportData {
       report(code: $report_id) {
         startTime,
         fights {
           startTime,
           endTime,
           id,
           keystoneLevel,
           name,
           startTime,
           dungeonPulls {
             startTime,
             endTime,
           },
         }
       }
     }
    }
  `;
  const response = await wcl_query(auth_token, query, {
    report_id: report_id,
  });
  return response.reportData.report;
}

class CodexApp extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      fights: null,
      drill_state: {
        report_id: null,
        fight_id: null,
        player_id: null,
      },
    };
  }
  render() {
    // what to do here? well, I guess we can now get the latest reports even.
    // for now, let's just render a text box I guess?
    if (this.state.fights) {
      return 'fights lol';
    }
    return (
      <div>
        <label for='report'>Enter a report ID or paste a URL:</label>
        <input type='text' id='report' name='report' onInput={(e)=>this.handleReportInput(e)} />
      </div>
    );
  }

  handleReportInput(e) {
    let drill_state = {
      report_id: null,
      fight_id: null,
      player_id: null,
    };
    if (!e.target.value) {
      return;
    }
    if (e.target.value.includes('warcraftlogs.com')) {
      drill_state = parseReportUrl(e.target.value);
    } else {
      drill_state.report_id = e.target.value;
    }

    if (!drill_state.report_id) {
      // Nothing to do with no legit report id
      return;
    }

    this.setState({drill_state: drill_state});

    list_fights(
      this.props.auth_token, drill_state.report_id,
    ).then(
      (fights) => this.setState({fights: fights})
    ).catch(
      (err) => console.log(err)
    );
  }
}

class AppRoot extends React.Component {
  constructor(props) {
    super(props);

    const code = getRedirectCodeOrNull();
    const auth_token = getAuthTokenOrNull();

    this.state = {
      auth_token: auth_token,
      awaiting_token: !!code,
    };

    if (code) {
      this.getAuthToken(code);
    }
  }

  async getAuthToken(code) {
    this.setState({
      awaiting_token: true,
    });
    const response = await fetch(wcl_tok_uri, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-cache',
      body: new URLSearchParams({
        client_id: wcl_client_id,
        code_verifier: window.sessionStorage.getItem('verifier'),
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code',
        code: code,
      }),
    });

    const j = await response.json();
    if (!j.access_token || !response.ok) {
      window.sessionStorage.removeItem('auth_token');
    } else {
      window.sessionStorage.setItem('auth_token', j.access_token);
    }
    // Remove code from url, so that it's safely copyable
    let params = new URLSearchParams(window.location.search);
    params.delete('code');
    //history.replaceState({}, '', window.location.origin + window.location.pathname + params)
    this.setState({
      awaiting_token: false,
      auth_token: j.access_token,
    });
  }

  async startAuth() {
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
    window.location = wcl_auth_uri + '/?' + args;
  }

  render() {
    if (!this.state.auth_token && !this.state.awaiting_token) {
      // the state is "needs auth"
      return <button onClick={()=>this.startAuth()}>Authenticate with WCL</button>;
    } else if (this.state.awaiting_token) {
      // the state is "getting_token"
      return 'Waiting for token from WCL';
    } else {
      return <CodexApp auth_token={this.state.auth_token} />;
    }
  }
}


const domContainer = document.querySelector('#root');
const root = ReactDOM.createRoot(domContainer);
root.render(<AppRoot/>);
