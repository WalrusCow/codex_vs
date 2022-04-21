'use strict';

const codex_id = 185836;

async function analyze_codex(auth_token, report_id, fight, player_data) {
  let result = {
    codex_damage: null,
    strength_trinket_damage: null
  };
  return result;
} // TODO: food for thought.. are there background JS worker things we can take
// advantage of to do this heavy lifting?
//
// TODO: We don't really want this exactly. probably we just want to show every
// player and then under them show the stats about codex (yes, this)
//
// so this function should be 2 parts.. one to actually call list_players from
// python impl. then after we fetch combatantinfo and merge it together into one
// unseemly beast
//
// then separately we'll have a stateful class constructed from that data
// that will be used to process the events
//  class Player // name, is_codex, player_id, server, etc
//  class PlayerAnalyzer // Player, combat_events -> getCodexStats
//
// to start with, the stats will be "not wearing codex"
// in the future, "simulated codex dps" will be a part of it too
//
// if wearing codex
//  Strength dps (damage) (estimated)
//  Codex dps (damage)
//  Passive trinket dps (benchmark, not actual data)
//  Verdict: WORTH / NOT WORTH
// or, if not wearing codex
//  Strength dps (damage)
//  Codex dps (damage) (estimated)
//  Trinket dps (benchmark, not actual data)
//  Verdict: WORTH / NOT WORTH
// TODO: eventually also consider
//  what if I upgraded codex?
//  did codex save life?
//  select trinket ilvl


async function analyze_player(auth_token, report_id, fight, player) {
  // TODO: the whole app
  // determine player initial state
  // query for events
  // for each event..
  //  await query_all_events
  // merge_events()
  // analyze_events()
  // construct and return summary of results
  return {};
}

async function analyze_players(auth_token, report_id, fight, players) {
  let analysis = {};

  for (var player of players) {
    // TODO: Should this actually be a web worker thing?
    analysis[player.id] = await analyze_player(auth_token, report_id, fight, player);
  }

  return analysis;
}

export { analyze_players };