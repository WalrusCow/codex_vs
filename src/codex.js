'use strict';

import * as buffs from './buffs.js';
import * as wcl from './wcl.js';

const codex_id = 185836;
const codex_attack = 351450;

const passive_trinket_dps = 400;
const trinket_str = 151;

function apply_dr(pct) {
  const dr_pcts = [
    [126, 1],
    [66, .5],
    [54, .4],
    [47, .3],
    [39, .2],
    [30, .1],
    [0, 0],
  ];

  let result = 0
  for (const [min_pct, rate] of dr_pcts) {
    if (pct > min_pct) {
      result += (pct - min_pct) * (1 - rate);
      pct = min_pct;
    }
  }
  return result;
}

class Secondary {
  constructor(name, rating) {
    this.name = name;
    this.rating = rating;
  }

  get_pct(stat) {
    return apply_dr(stat / this.rating) / 100;
  }
}

const HASTE = new Secondary("haste", 33);
const MASTERY = new Secondary("mastery", 17.5 / 2);
const VERS = new Secondary("vers", 40);
const CRIT = new Secondary("crit", 35);

class Aura {
  constructor(buff, stacks=1) {
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
  const buff_list = json.map((a) => buffs.str_buffs[a.ability]).filter((a) => a);
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
  return new Aura(buffs.str_buffs[e.abilityGameID], (e.stacks || 1));
}

function weapon_ilvl_to_dps(x) {
  // TODO: lol this is just for 278
  return 99.3;
}

function mixin_str(auras, str) {
  let total_str = str;
  for (const t of ['add', 'mul']) {
    for (const a of (Object.values(auras).filter((x) => x.buff.type == t))) {
      total_str = a.mixin(total_str);
    }
  }
  return total_str;
}

function mixout_str(auras, str) {
  let base_str = str;
  for (const t of ['mul', 'add']) {
    for (const a of (Object.values(auras).filter((x) => x.buff.type == t))) {
      base_str = a.mixout(base_str);
    }
  }
  return base_str;
}

class PlayerState {
  constructor(player) {
    this.player = player;
    // extract initial buffs and etc
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
  let events = []
  for (const type of ['DamageDone', 'DamageTaken', 'Buffs', 'Casts']) {
    events = events.concat(await wcl.query_all_events(
      auth_token, report_id, fight, type, player.id));
  }
  events.sort((a, b) => a.timestamp - b.timestamp);
  return events;
}

async function analyze_player(auth_token, report_id, fight, player) {
  if (player.type != 'DeathKnight' || player.specs[0].spec != 'Blood') {
    return {
      error: 'Not a Blood DK',
    };
  }
  if (!player.combat_info) {
    return {
      error: 'Log does not contain gear info',
    };
  }

  if (!player.combat_info.gear.find((g) => g.id == codex_id)) {
    // So far only works for people wearing a codex
    await sim_codex(auth_token, report_id, fight, player);
  } else {
    //await sim_codex(auth_token, report_id, fight, player);
    return await analyze_codex(auth_token, report_id, fight, player);
  }
}

async function sim_codex(auth_token, report_id, fight, player) {
  // Not finished yet
  return {
    error: 'Not wearing Codex',
  };
  let player_state = new PlayerState(player);
  let latest_ap = player_state.get_ap();


  // TODO: Check what trinket we're competing with and subtract its damage effect?
  let crit = CRIT.get_pct(player.combat_info.critMelee) + 0.05;
  let haste = HASTE.get_pct(player.combat_info.hasteMelee);
  let vers = VERS.get_pct(player.combat_info.versatilityDamageDone);
  console.log(`crit is ${crit} haste is ${haste} vers is ${vers}`);

  let combat_events = await get_combat_events(auth_token, report_id, fight, player);
  let expected_codex_dmg = 0;
  let lost_str_dmg = 0;

  // spell data claims this is hasted, but it doesn't seem to be
  let rppm = 2.5;// * (1 + haste);
  const codex_duration = 12;
  let time_since_trigger = 3.5;
  let last_trigger_time = 0;

  let trigger_events = []
  let total_dmg_taken = 0;

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
      if (e.targetID == player.id) {
        if (damage_done == 0) continue;
        // damage taken
        total_dmg_taken += damage_done;
        let time_since_trigger = (e.timestamp - last_trigger_time) / 1000;
        last_trigger_time = e.timestamp;
        console.log(`Time since trigger ${time_since_trigger}`);

        // https://gist.github.com/Dorovon/74c4fcf49ae799d92066b3266dcdcebc
        // TODO: +13.1% for bad luck protection (on avg?) is that right?
        let proc_chance = rppm * Math.min(3.5, time_since_trigger) / 60 * 1.131;

        while (trigger_events.length > 0 && trigger_events[0].t < (e.timestamp - codex_duration * 1000)) {
          // Pop this event off since it's not in the uptime window
          trigger_events.shift();
        }

        // Chance it ever triggered is 1 - chance it never triggered
        let active_chance = 1;
        for (var te of trigger_events) {
          active_chance *= (1 - te.rate);
        }
        active_chance = 1 - active_chance;

        console.log(`Active chance is ${active_chance}, proc chance is ${proc_chance}, together ${active_chance + proc_chance}`);
        let expected_dmg_here = damage_done / 10 * (1 + vers) * (1 + crit) * active_chance
        // Does not reflect on the triggering event itself
        trigger_events.push({rate: proc_chance, t: e.timestamp});
        expected_codex_dmg += expected_dmg_here;
      } else {
        // damage done
        if (e.abilityGameID == codex_attack) {
          //codex_dmg += damage_done;
        } else if (buffs.ap_abilities.find((x) => x == e.abilityGameID)) {
          // this is an attack that scales from player AP
          const dmg_coeff = damage_done / latest_ap;
          const ap_coeff = latest_ap / player_state.get_ap();
          player_state.base_str -= trinket_str;
          const new_dmg = player_state.get_ap() * ap_coeff * dmg_coeff;
          player_state.base_str += trinket_str;
          if (new_dmg > damage_done) {
            console.log('Less strength is more damage?');
            debugger;
          }
          lost_str_dmg += (damage_done - new_dmg);
        }
      }

      // else uninteresting spell
    } else if (e.type == 'cast' && ((e.attackPower || 0) > 0)) {
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
  const codex_dps = expected_codex_dmg / (combat_time / 1000);
  const str_dps = lost_str_dmg / (combat_time / 1000);
  console.log(`codex ps ${codex_dps} dmg ${expected_codex_dmg}  str ${str_dps} takenb ${total_dmg_taken}`);
  return {error: 'fuck off lol'};

  return {
    //codex_dmg: codex_dmg,
    //codex_dps: codex_dps,
    str_dmg: added_str_dmg,
    str_dps: str_dps,
    trinket_dmg: passive_trinket_dps * (combat_time / 1000),
    trinket_dps: passive_trinket_dps,
  };

}

async function analyze_codex(auth_token, report_id, fight, player) {
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
      } else if (buffs.ap_abilities.find((x) => x == e.abilityGameID)) {
        // this is an attack that scales from player AP
        const dmg_coeff = damage_done / latest_ap;
        const ap_coeff = latest_ap / player_state.get_ap();
        player_state.base_str += trinket_str;
        const new_dmg = player_state.get_ap() * ap_coeff * dmg_coeff;
        player_state.base_str -= trinket_str;
        if (new_dmg < damage_done) {
          console.log('More strength is less damage?');
          debugger;
        }
        added_str_dmg += (new_dmg - damage_done);
      }
      // else uninteresting spell
    } else if (e.type == 'cast' && ((e.attackPower || 0) > 0)) {
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
    trinket_dps: passive_trinket_dps,
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

export {
  analyze_players,
};

// TODO: food for thought.. are there background JS worker things we can take
// advantage of to do this heavy lifting?
