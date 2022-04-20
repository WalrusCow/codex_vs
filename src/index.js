'use strict';

import * as auth from './auth.js';

const wcl_api = 'https://www.warcraftlogs.com/api/v2/client'

function parseReportUrl(url) {
  let result = {
    report_id: null,
    fight_id: null,
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
    if (result.fight_id) {
      result.fight_id = parseInt(result.fight_id);
    }
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
  // TODO: Map this to change times to absolute times / dates
  const report_start = response.reportData.report.startTime;
  for (var fight of response.reportData.report.fights) {
    fight.date = new Date(report_start + fight.startTime);
  }
  return response.reportData.report.fights;
}

function FightItem(props) {
  const f = props.fight;
  const duration_str = (function() {
    const dur_s = Math.floor((f.endTime - f.startTime) / 1000);
    const secs = (Math.floor(dur_s) % 60).toString().padStart(2, '0');
    const mins = (Math.floor(dur_s / 60)).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  })();

  // 2022-04-19, 20:25
  const date_str = f.date.toLocaleString('en-CA', {
    timeStyle: 'short', dateStyle: 'short', hour12: false,
  });

  const id_str = `fight_${f.id}`;
  return (
    <li>
      <input
        type='radio'
        id={id_str}
        name='fight'
        value={f.id}
        onClick={props.clickFight}
        checked={props.selected}
      />
      <label for={id_str}>{f.name} {duration_str} ({date_str})</label>
    </li>
  );
}

function FightsList(props) {
  return (
    <ul>{
      props.fights.map((f) =>
        <FightItem
          fight={f}
          key={f.id}
          clickFight={props.clickFight}
          selected={props.selected_fight === f.id}
        />
      )
    }
    </ul>
  );
}

function AnalysisResults(props) {
  return <div>Results!</div>;
}

class CodexApp extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      fights: null,
      report_id: null,
      fight_id: null,
      analysis_results: null,
    };
  }

  render() {
    // what to do here? well, I guess we can now get the latest reports even.
    // for now, let's just render a text box I guess?
    let fights_list = null;
    if (this.state.fights) {
      fights_list = <FightsList
        fights={this.state.fights}
        clickFight={(e) => this.selectFight(e)}
        selected_fight={this.state.fight_id}
      />;
    }

    let analysis_results = null;
    if (this.state.analysis_results) {
      analysis_results = <AnalysisResults />
    } else if (this.state.fight_id) {
      analysis_results = <div id='loading'>Loading...</div>
    }

    return (
      <div>
        <label for='report'>Enter a report ID or paste a URL:</label>
        <input type='text' id='report' name='report' onInput={(e)=>this.handleReportInput(e)} />
        {fights_list}
        {analysis_results}
      </div>
    );
  }

  selectFight(e) {
    console.log(`setting state to be ${parseInt(e.target.value)}`);
    this.setState({fight_id: parseInt(e.target.value)});
  }

  handleReportInput(e) {
    let drill_state = {
      report_id: null,
      fight_id: null,
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
      // Nothing to do with no possibly-legit report id
      return;
    }

    this.setState({
      report_id: drill_state.report_id,
      fight_id: drill_state.fight_id,
    });

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

    const code = auth.getRedirectCodeOrNull();
    const auth_token = auth.getAuthTokenOrNull();

    this.state = {
      auth_token: auth_token,
      awaiting_token: !!code,
    };

    if (code) {
      auth.getAuthToken(code).then(
        (tok) => this.setState({
          awaiting_token: false,
          auth_token: tok,
        })
      );
    }
  }

  render() {
    if (!this.state.auth_token && !this.state.awaiting_token) {
      // the state is "needs auth"
      return <button onClick={auth.redirectForAuth}>Authenticate with WCL</button>;
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
