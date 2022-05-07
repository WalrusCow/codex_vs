'use strict';

import * as auth from './auth.js';
import * as wcl from './wcl.js';
import * as codex from './codex.js';

function parse_report_url(url) {
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
  if (result.report_id.endsWith('/')) {
    result.report_id = result.report_id.substr(0, result.report_id.length - 1);
  }
  if (url.hash) {
    // Strip leading # from hash
    let params = new URLSearchParams(url.hash.substr(1));
    result.fight_id = params.get('fight');
    if (result.fight_id && result.fight_id != 'last') {
      result.fight_id = parseInt(result.fight_id);
    }
  }
  return result;
}

function PlayerList(props) {
  if (!props.players) {
    return <div display='flex'>Loading...</div>;
  }
  return (
    <div display='flex'>
      {props.players.map((p) => <PlayerCard
        player={p}
        analysis={props.analysis && props.analysis[p.id]}
      />)}
    </div>
  );
}

function PlayerAnalysis(props) {
  // no data yet means we're loading it.. or maybe it means this isn't supported?
  if (!props.analysis) {
    return <div>Loading!</div>;
  }
  if (props.analysis.error) {
    return <div>{props.analysis.error}</div>;
  }
  let value_text = 'Weak for Codex';
  const dps_diff = props.analysis.trinket_dps - props.analysis.codex_dps;
  if (Math.abs(dps_diff) < (props.analysis.trinket_dps * 0.1)) {
    value_text = 'Okay for Codex';
  } else if (dps_diff < 0) {
    value_text = 'Strong for Codex';
  }
  return (
    <div>
      <p><strong>{value_text}</strong></p>
      <p>Effective codex dps: {Math.round(props.analysis.codex_dps)}</p>
      <p>Passive trinket dps: {props.analysis.trinket_dps}</p>
      <p>Codex damage: {Math.round(props.analysis.codex_dmg)}</p>
      <p>Strength damage: {Math.round(props.analysis.str_dmg)}</p>
    </div>
  );
}

function PlayerCard(props) {
  return (
    <div>
      <div>{props.player.name}-{props.player.server}: {props.player.type}</div>
      <PlayerAnalysis analysis={props.analysis} />
    </div>
  );
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
  let name_str = `${f.name}`;
  if (f.keystoneLevel) {
    name_str = `+${f.keystoneLevel} ${name_str}`;
  }
  return (
    <li>
      <input
        type='radio'
        id={id_str}
        name='fight'
        value={f.id}
        onClick={() => props.clickFight(f)}
        checked={props.selected}
      />
      <label for={id_str}>{name_str} {duration_str} ({date_str})</label>
    </li>
  );
}

function FightList(props) {
  return (
    <div>
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
    </div>
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
      fight: null,
      players: null,
      analysis: null,
    };
  }

  render() {
    // what to do here? well, I guess we can now get the latest reports even.
    // for now, let's just render a text box I guess?
    let fights_list = null;
    if (this.state.fights) {
      fights_list = <FightList
        fights={this.state.fights}
        clickFight={(f) => this.set_fight(f)}
        selected_fight={this.state.fight && this.state.fight.id}
      />;
    }

    let player_list = null;
    if (this.state.players) {
      player_list = <PlayerList
        players={this.state.players}
        analysis={this.state.analysis}
      />;
    } else if (this.state.selected_fight) {
      player_list = <div id='loading'>Loading...</div>;
    }

    return (
      <div>
        <div id='input_box'>
          <label class='subtitle'>Report ID or URL</label>
          <input type='text' id='report' name='report' onInput={(e)=>this.handleReportInput(e)} />
        </div>
        <div id='columns_box'>
          {fights_list}
          {player_list}
        </div>
      </div>
    );
  }

  async set_fight(fight) {
    this.setState({
      fight: fight,
      // clear old players while new ones load
      players: null,
      analysis: null,
    });

    let players = await wcl.list_players(
      this.props.auth_token,
      this.state.report_id,
      fight,
    );
    players = players.filter((p) => p.type == 'DeathKnight' && p.specs[0].spec == 'Blood');
    this.setState(function(s) {
      if (s.fight.id == fight.id) {
        s.players = players;
      }
      return s;
    });

    // TODO: Or split this per player already? maybe better out here yeah
    const analysis = await codex.analyze_players(
      this.props.auth_token,
      this.state.report_id,
      fight,
      players,
    );
    this.setState(function(s) {
      if (s.fight.id == fight.id) {
        s.analysis = analysis;
      }
      return s;
    });
  }

  async handleReportInput(e) {
    let report_id = null;
    let fight_id = null;
    if (!e.target.value) {
      return;
    }
    if (e.target.value.includes('warcraftlogs.com')) {
      ({report_id, fight_id} = parse_report_url(e.target.value));
    } else {
      report_id = e.target.value;
    }

    if (!report_id) {
      // Nothing to do with no possibly-legit report id
      return;
    }

    this.setState({
      report_id: report_id,
    });

    let fights = await wcl.list_fights(this.props.auth_token, report_id);
    fights = fights.filter((f) => f.keystoneLevel);
    this.setState({
      fights: fights,
    });

    if (fight_id) {
      this.set_fight(fights.at(fight_id == 'last' ? -1 : fight_id));
    }
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
    let contents = null;
    if (!this.state.auth_token && !this.state.awaiting_token) {
      // the state is "needs auth"
      contents = <button onClick={auth.redirectForAuth}>Authenticate with WCL</button>;
    } else if (this.state.awaiting_token) {
      // the state is "getting_token"
      contents = 'Waiting for token from WCL';
    } else {
      contents = <CodexApp auth_token={this.state.auth_token} />;
    }
    return (
      <div id='app'>
      <h1>Codex Analysis</h1>
      {contents}
      </div>
    );
  }
}


const domContainer = document.querySelector('#root');
const root = ReactDOM.createRoot(domContainer);
root.render(<AppRoot/>);
