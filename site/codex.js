'use strict';

import * as buffs from './buffs.js';
import * as wcl from './wcl.js';
const codex_id = 185836;
const codex_attack = 351450;
const passive_trinket_dps = 360;
const trinket_str_278 = 125;

class Aura {
  constructor(buff, stacks = 1) {
    this.buff = buff;
    this.stacks = stacks;
  }

  mixout(strength) {
    return this.buff.mixout(strength, this.stacks);
  }

  mixin(strength) {
    return this.buff.mixin(strength, this.stacks);
  }

}

function auras_from_json(json) {
  // remove nulls with filter
  const buff_list = json.map(a => buffs.str_buffs[a.ability]).filter(a => a);
  let result = {};

  for (const b of buff_list) {
    result[b.spell_id] = new Aura(b, b.stacks || 1);
  }

  return result;
}

function aura_from_buff_event(e) {
  if (!e.abilityGameID || !buffs.str_buffs[e.abilityGameID]) {
    return null;
  }

  return new Aura(buffs.str_buffs[e.abilityGameID], e.stacks || 1);
}

function weapon_ilvl_to_dps(x) {
  // TODO: lol this is just for 278
  return 99.3;
}

function mixin_str(auras, str) {
  let total_str = str;

  for (const t of ['add', 'mul']) {
    for (const a of Object.values(auras).filter(x => x.buff.type == t)) {
      total_str = a.mixin(total_str);
    }
  }

  return total_str;
}

function mixout_str(auras, str) {
  let base_str = str;

  for (const t of ['mul', 'add']) {
    for (const a of Object.values(auras).filter(x => x.buff.type == t)) {
      base_str = a.mixout(base_str);
    }
  }

  return base_str;
}

class PlayerState {
  constructor(player) {
    this.player = player; // extract initial buffs and etc

    this.auras = auras_from_json(player.combat_info.auras);
    this.base_str = mixout_str(this.auras, player.combat_info.strength);
    this.wep_dps = weapon_ilvl_to_dps(player.combat_info.gear[15].itemLevel);
  }

  get_aura(aura) {
    return this.auras[aura.buff.spell_id];
  }

  add_aura(aura) {
    this.auras[aura.buff.spell_id] = aura;
  }

  remove_aura(aura) {
    if (aura) delete this.auras[aura.buff.spell_id];
  }

  get_ap() {
    return mixin_str(this.auras, this.base_str) + this.wep_dps * 6;
  }

}

async function get_combat_events(auth_token, report_id, fight, player) {
  let events = [];

  for (const type of ['DamageDone', 'Buffs', 'Casts']) {
    events = events.concat(await wcl.query_all_events(auth_token, report_id, fight, type, player.id));
  }

  events.sort((a, b) => a.timestamp - b.timestamp);
  return events;
}

async function analyze_player(auth_token, report_id, fight, player) {
  if (player.type != 'DeathKnight' || player.specs[0].spec != 'Blood') {
    return {
      error: 'Not a Blood DK'
    };
  }

  if (!player.combat_info) {
    return {
      error: 'Log does not contain gear info'
    };
  }

  if (!player.combat_info.gear.find(g => g.id == codex_id)) {
    // So far only works for people wearing a codex
    return {
      error: 'Not wearing Codex'
    };
  }

  let player_state = new PlayerState(player);
  let combat_events = await get_combat_events(auth_token, report_id, fight, player);
  let latest_ap = player_state.get_ap();
  let added_str_dmg = 0;
  let codex_dmg = 0;

  for (var e of combat_events) {
    if (e.type == 'applybuff' || e.type == 'applybuffstack') {
      const aura = aura_from_buff_event(e);

      if (!aura) {
        continue;
      }

      if (aura.abilityGameId == 342181 && player_state.get_aura(aura)) {
        // Lead by Example has a special case where it doesn't have true stacks
        // infer "stacks" based on how many allies it affected
        player_state.get_aura(aura).stacks += 1;
        continue;
      }

      if (e.targetID != player.id) {
        continue;
      }

      player_state.add_aura(aura);
    } else if (e.type == 'removebuff') {
      // only if player is the target
      if (e.targetID == player.id) {
        player_state.remove_aura(aura_from_buff_event(e));
      }
    } else if (e.type == 'damage') {
      const damage_done = e.amount + (e.absorbed || 0);

      if (damage_done === undefined || damage_done == null) {
        debugger;
      }

      if (e.abilityGameID == codex_attack) {
        codex_dmg += damage_done;
      } else if (buffs.ap_abilities.find(x => x == e.abilityGameID)) {
        // this is an attack that scales from player AP
        const dmg_coeff = damage_done / latest_ap;
        const ap_coeff = latest_ap / player_state.get_ap();
        player_state.base_str += trinket_str_278;
        const new_dmg = player_state.get_ap() * ap_coeff * dmg_coeff;
        player_state.base_str -= trinket_str_278;

        if (new_dmg < damage_done) {
          console.log('More strength is less damage?');
          debugger;
        }

        added_str_dmg += new_dmg - damage_done;
      } // else uninteresting spell

    } else if (e.type == 'cast' && (e.attackPower || 0) > 0) {
      latest_ap = e.attackPower;
    }
  }

  let combat_time = 0;

  if (fight.dungeonPulls) {
    for (const pull of fight.dungeonPulls) {
      combat_time += pull.endTime - pull.startTime;
    }
  } else {
    combat_time = fight.endTime - fight.startTime;
  }

  const codex_dps = codex_dmg / (combat_time / 1000);
  const str_dps = added_str_dmg / (combat_time / 1000);
  return {
    codex_dmg: codex_dmg,
    codex_dps: codex_dps,
    str_dmg: added_str_dmg,
    str_dps: str_dps,
    trinket_dmg: passive_trinket_dps * (combat_time / 1000),
    trinket_dps: passive_trinket_dps
  };
}

async function analyze_players(auth_token, report_id, fight, players) {
  let analysis = {};

  for (var player of players) {
    // TODO: Should this actually be a web worker thing?
    // TODO: We should really only analyze blood dks
    analysis[player.id] = await analyze_player(auth_token, report_id, fight, player);
  }

  return analysis;
}

export { analyze_players }; // TODO: food for thought.. are there background JS worker things we can take
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