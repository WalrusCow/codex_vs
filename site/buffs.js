'use strict';

class Buff {
  constructor({
    name,
    spell_id,
    base_coeff,
    type,
    stack_coeff
  }) {
    this.name = name;
    this.spell_id = spell_id;
    this.base_coeff = base_coeff;
    this.type = type;

    if (type == 'add') {
      this.mixin_func = (a, b) => a + b;

      this.mixout_func = (a, b) => a - b;
    } else if (type == 'mul') {
      this.mixin_func = (a, b) => a * b;

      this.mixout_func = (a, b) => a / b;
    }

    this.stack_coeff = stack_coeff || 0;
  }

  mixin(str, stacks) {
    return this.mixin_func(str, this.coeff(stacks));
  }

  mixout(str, stacks) {
    return this.mixout_func(str, this.coeff(stacks));
  }

  coeff(stacks) {
    let val = this.base_coeff + stacks * this.stack_coeff;

    if (this.type == 'mul') {
      val += 1;
    }

    return val;
  }

}

const buff_list = [new Buff({
  type: 'add',
  name: 'Well Fed (Big Feast)',
  spell_id: 327706,
  base_coeff: 20
}), new Buff({
  type: 'add',
  name: 'Flask',
  spell_id: 307185,
  base_coeff: 70
}), new Buff({
  type: 'add',
  name: 'Well Fed(Small Feast)',
  spell_id: 327701,
  base_coeff: 18
}), new Buff({
  type: 'add',
  name: 'Augment Rune',
  spell_id: 347901,
  base_coeff: 18
}), new Buff({
  type: 'mul',
  name: 'Endless Rune Waltz',
  spell_id: 364197,
  //TODO
  base_coeff: 0,
  stack_coeff: 0.01
}), new Buff({
  type: 'mul',
  name: 'Unholy Strength',
  spell_id: 53365,
  base_coeff: 0.15
}), new Buff({
  type: 'mul',
  name: "Death\'s Due",
  spell_id: 324165,
  base_coeff: 0,
  stack_coeff: 0.05 //TODO: Deal with non-legendary? But why bother tbh

}), new Buff({
  type: 'mul',
  name: 'Volatile Solvent (beast)',
  spell_id: 323491,
  base_coeff: 0.02
}), new Buff({
  type: 'mul',
  name: "The Duke's Tea",
  spell_id: 353266,
  base_coeff: 0.03
}), new Buff({
  type: 'mul',
  name: "Built for War",
  spell_id: 0,
  //TODO
  base_coeff: 0,
  stack_coeff: 0.01
}), new Buff({
  type: 'mul',
  name: 'Lead by Example',
  spell_id: 342181,
  base_coeff: 0.05,
  stack_coeff: 0.02
}), new Buff({
  type: 'mul',
  name: 'Newfound Resolve',
  spell_id: 352917,
  base_coeff: 0.10
}), new Buff({
  type: 'mul',
  name: 'Adaptive Armor Fragment',
  spell_id: 357972,
  base_coeff: 0.038 //TODO: How to deal with ilvl?

})];
let str_buffs = {};

for (const b of buff_list) {
  str_buffs[b.spell_id] = b;
}

const ap_abilities = [206930, // heart strike
49998, // death strike
327574, // sac pact
50842, // blood boil
194182, // marrow
195212, // death's caress
323798, // abom limb
311648, // swarming mist
324128, // death's due
312202, // shackle
47541, // death coil lol pls no
352095, // pustule eruption (emeni)
1, // auto attack (HOW THIS WORK??)
228645, // drw heart strike (??)
91776, // ghoul claw
91800, // ghoul gnaw
320660, // niya poison
320659 // niya burrs
];
export { ap_abilities, str_buffs };