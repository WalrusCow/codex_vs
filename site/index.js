'use strict';

import * as auth from './auth.js';
import * as wcl from './wcl.js';
import * as codex from './codex.js';
const short_dungeon_names = {
  "De Other Side": "De Other Side",
  "Halls of Atonement": "Halls",
  "Mists of Tirna Scithe": "Mists",
  "Plaguefall": "Plaguefall",
  "Sanguine Depths": "Sanguine",
  "Spires of Ascension": "Spires",
  "Tazavesh: So'leah's Gambit": "Gambit",
  "Tazavesh: Streets of Wonder": "Streets",
  "The Necrotic Wake": "Necrotic Wake",
  "Theater of Pain": "Theater"
};

function parse_report_url(url) {
  let result = {
    report_id: null,
    fight_id: null
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

function Loading(props) {
  return /*#__PURE__*/React.createElement("div", {
    class: "loading"
  }, /*#__PURE__*/React.createElement("div", {
    class: "loading_anim"
  }, /*#__PURE__*/React.createElement("div", null), /*#__PURE__*/React.createElement("div", null), /*#__PURE__*/React.createElement("div", null), /*#__PURE__*/React.createElement("div", null)), /*#__PURE__*/React.createElement("span", null, "Loading..."));
}

function PlayerList(props) {
  let contents = null;

  if (!props.players) {
    contents = /*#__PURE__*/React.createElement(Loading, null);
  } else if (props.players.length == 0) {
    contents = /*#__PURE__*/React.createElement("div", null, "No Blood Death Knights found!");
  } else {
    contents = props.players.map(p => /*#__PURE__*/React.createElement(PlayerCard, {
      player: p,
      analysis: props.analysis && props.analysis[p.id]
    }));
  }

  return /*#__PURE__*/React.createElement("div", {
    class: "players_box"
  }, /*#__PURE__*/React.createElement("h2", null, "Analysis"), contents);
}

function PlayerAnalysis(props) {
  // no data yet means we're loading it.. or maybe it means this isn't supported?
  if (!props.analysis) {
    return /*#__PURE__*/React.createElement(Loading, null);
  }

  if (props.analysis.error) {
    return /*#__PURE__*/React.createElement("div", null, props.analysis.error);
  }

  const decanter_dps = props.analysis.str_dps + props.analysis.trinket_dps;
  const decanter_dmg = props.analysis.str_dmg + props.analysis.trinket_dmg;
  const dps_diff = decanter_dps - props.analysis.codex_dps;
  const codex_best = dps_diff < 0;
  const is_close = Math.abs(dps_diff) < props.analysis.trinket_dps * 0.1;
  const codex_link = 'https://www.wowhead.com/item=185836/codex-of-the-first-technique?bonus=6536:5968';
  const decanter_link = 'https://www.wowhead.com/item=178861/decanter-of-anima-charged-winds?bonus=6536:5965&class=6&spec=250';

  function shortNumber(num) {
    num = Math.round(num);

    if (num > 1_000_000) {
      return (num / 1_000_000).toPrecision(3) + 'M';
    } else if (num > 1_000) {
      return (num / 1_000).toPrecision(3) + 'k';
    }

    return num;
  } // TODO: Add a little hover ? thing to explain the stuff
  // TODO: Add a little corner banner maybe for which is best to make it more obvious?


  return /*#__PURE__*/React.createElement("div", {
    class: "analysis_box"
  }, /*#__PURE__*/React.createElement("div", {
    class: `result_box ${codex_best ? "better" : "worse"}`
  }, /*#__PURE__*/React.createElement("div", {
    class: "ribbon"
  }, /*#__PURE__*/React.createElement("span", null, '\u2605')), /*#__PURE__*/React.createElement("div", {
    class: "result_title"
  }, /*#__PURE__*/React.createElement("a", {
    href: `${codex_link}`,
    target: "_blank"
  }, "Codex")), /*#__PURE__*/React.createElement("div", {
    class: "result_contents"
  }, /*#__PURE__*/React.createElement("span", {
    class: "result_text"
  }, "DPS: ", shortNumber(props.analysis.codex_dps)), /*#__PURE__*/React.createElement("span", {
    class: "result_text"
  }, "Damage: ", shortNumber(props.analysis.codex_dmg)))), /*#__PURE__*/React.createElement("div", {
    class: `result_box ${!codex_best ? "better" : "worse"}`
  }, /*#__PURE__*/React.createElement("div", {
    class: "ribbon"
  }, /*#__PURE__*/React.createElement("span", null, '\u2605')), /*#__PURE__*/React.createElement("div", {
    class: "result_title"
  }, /*#__PURE__*/React.createElement("a", {
    href: `${decanter_link}`,
    target: "_blank"
  }, "Decanter"), " (estimated)"), /*#__PURE__*/React.createElement("div", {
    class: "result_contents"
  }, /*#__PURE__*/React.createElement("span", {
    class: "result_text"
  }, "DPS: ", shortNumber(decanter_dps)), /*#__PURE__*/React.createElement("span", {
    class: "result_text"
  }, "Damage: ", shortNumber(decanter_dmg)))));
}

function PlayerCard(props) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    class: "player_name"
  }, props.player.name, "-", props.player.server, ": ", props.player.specs[0].spec, " ", props.player.type.replace(/([A-Z])/g, ' $1')), /*#__PURE__*/React.createElement(PlayerAnalysis, {
    analysis: props.analysis
  }));
}

function FightItem(props) {
  const f = props.fight;

  const duration_str = function () {
    const dur_s = Math.floor((f.endTime - f.startTime) / 1000);
    const secs = (Math.floor(dur_s) % 60).toString().padStart(2, '0');
    const mins = Math.floor(dur_s / 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }(); // 2022-04-19, 20:25


  const date_str = f.date.toLocaleString('en-CA', {
    timeStyle: 'short',
    dateStyle: 'short',
    hour12: false
  });
  const id_str = `fight_${f.id}`;
  let name_str = `${short_dungeon_names[f.name] || f.name}`;

  if (f.keystoneLevel) {
    name_str = `+${f.keystoneLevel} ${name_str}`;
  }

  return /*#__PURE__*/React.createElement("div", {
    class: "fight_item"
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    id: id_str,
    name: "fight",
    value: f.id,
    onClick: () => props.clickFight(f),
    checked: props.selected
  }), /*#__PURE__*/React.createElement("label", {
    for: id_str
  }, /*#__PURE__*/React.createElement("span", {
    class: "fight_title"
  }, name_str, " ", duration_str), /*#__PURE__*/React.createElement("span", {
    class: "fight_date"
  }, date_str)));
}

function FightList(props) {
  return /*#__PURE__*/React.createElement("div", {
    class: "fights_box"
  }, /*#__PURE__*/React.createElement("h2", null, "Select a run"), /*#__PURE__*/React.createElement("div", {
    class: "fight_list"
  }, props.fights.map(f => /*#__PURE__*/React.createElement(FightItem, {
    fight: f,
    key: f.id,
    clickFight: props.clickFight,
    selected: props.selected_fight === f.id
  })), /*#__PURE__*/React.createElement("div", {
    id: "fight_list_pad"
  })));
}

class CodexApp extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      fights: null,
      report_id: null,
      fight: null,
      players: null,
      analysis: null
    };
  }

  render() {
    // what to do here? well, I guess we can now get the latest reports even.
    // for now, let's just render a text box I guess?
    let fights_list = null;

    if (this.state.fights) {
      fights_list = /*#__PURE__*/React.createElement(FightList, {
        fights: this.state.fights,
        clickFight: f => this.set_fight(f),
        selected_fight: this.state.fight && this.state.fight.id
      });
    }

    let player_list = null;

    if (this.state.fight) {
      player_list = /*#__PURE__*/React.createElement(PlayerList, {
        players: this.state.players,
        analysis: this.state.analysis
      });
    }

    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      class: "report_input"
    }, /*#__PURE__*/React.createElement("label", {
      class: "subtitle",
      for: "report"
    }, "Report ID or URL"), /*#__PURE__*/React.createElement("input", {
      type: "text",
      id: "report",
      name: "report",
      onInput: e => this.handleReportInput(e)
    })), /*#__PURE__*/React.createElement("div", {
      class: "report_box"
    }, fights_list, player_list));
  }

  async set_fight(fight) {
    this.setState({
      fight: fight,
      // clear old players while new ones load
      players: null,
      analysis: null
    });
    let players = await wcl.list_players(this.props.auth_token, this.state.report_id, fight);
    players = players.filter(p => p.type == 'DeathKnight' && p.specs[0].spec == 'Blood');
    this.setState(function (s) {
      if (s.fight.id == fight.id) {
        s.players = players;
      }

      return s;
    }); // TODO: Or split this per player already? maybe better out here yeah

    const analysis = await codex.analyze_players(this.props.auth_token, this.state.report_id, fight, players);
    this.setState(function (s) {
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
      ({
        report_id,
        fight_id
      } = parse_report_url(e.target.value));
    } else {
      report_id = e.target.value;
    }

    if (!report_id) {
      // Nothing to do with no possibly-legit report id
      return;
    }

    this.setState({
      report_id: report_id,
      fights: null,
      fight: null,
      players: null,
      analysis: null
    });
    let fights = await wcl.list_fights(this.props.auth_token, report_id);
    fights = fights.filter(f => f.keystoneLevel || f.encounterID);
    this.setState({
      fights: fights
    });

    if (fight_id) {
      this.set_fight(fight_id == 'last' ? fights.at(-1) : fights.find(f => f.id == fight_id));
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
      awaiting_token: !!code
    };

    if (code) {
      auth.getAuthToken(code).then(tok => this.setState({
        awaiting_token: false,
        auth_token: tok
      }));
    }
  }

  render() {
    let contents = null;

    if (!this.state.auth_token && !this.state.awaiting_token) {
      // the state is "needs auth"
      contents = /*#__PURE__*/React.createElement("div", {
        id: "auth_container"
      }, /*#__PURE__*/React.createElement("button", {
        id: "auth_button",
        onClick: auth.redirectForAuth
      }, "Authenticate with WarcraftLogs"));
    } else if (this.state.awaiting_token) {
      // the state is "getting_token"
      contents = 'Waiting for token from WCL';
    } else {
      contents = /*#__PURE__*/React.createElement(CodexApp, {
        auth_token: this.state.auth_token
      });
    }

    return /*#__PURE__*/React.createElement("div", {
      id: "app"
    }, /*#__PURE__*/React.createElement("h1", null, "Codex Analysis"), contents);
  }

}

const domContainer = document.querySelector('#root');
const root = ReactDOM.createRoot(domContainer);
root.render( /*#__PURE__*/React.createElement(AppRoot, null));