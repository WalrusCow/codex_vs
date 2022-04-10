from str_buff import StrBuff, StrBuffType

def _add_buff(**kwargs):
    return StrBuff(**kwargs, buff_type=StrBuffType.ADD)

def _mul_buff(**kwargs):
    return StrBuff(**kwargs, buff_type=StrBuffType.MUL)

STR_BUFF_LIST = [
    _add_buff(
        name='Well Fed (Big Feast)',
        spell_id=327706,
        base_coeff=20,
    ),
    _add_buff(
        name='Flask',
        spell_id=307185,
        base_coeff=70,
    ),
    _add_buff(
        name='Well Fed(Small Feast)',
        spell_id=327701,
        base_coeff=18,
    ),
    _add_buff(
        name='Augment Rune',
        spell_id=347901,
        base_coeff=18,
    ),
    _mul_buff(
        name='Endless Rune Waltz',
        spell_id=364197,#TODO
        base_coeff=0,
        stack_coeff=0.01,
    ),
    _mul_buff(
        name='Unholy Strength',
        spell_id=53365,
        base_coeff=0.15,
    ),
    _mul_buff(
        name="Death\'s Due",
        spell_id=324165,
        base_coeff=0,
        stack_coeff=0.05,#TODO: Deal with non-legendary? But why bother tbh
    ),
    _mul_buff(
        name='Volatile Solvent (beast)',
        spell_id=323491,
        base_coeff=0.02,
    ),
    _mul_buff(
        name="The Duke's Tea",
        spell_id=353266,
        base_coeff=0.03,
    ),
    _mul_buff(
        name="Built for War",
        spell_id=0, #TODO
        base_coeff=0,
        stack_coeff=0.01,
    ),
    _mul_buff(
        name='Lead by Example',
        spell_id=342181,
        base_coeff=0.05,
        stack_coeff=0.02,
    ),
    _mul_buff(
        name='Newfound Resolve',
        spell_id=352917,
        base_coeff=0.10,
    ),
    _mul_buff(
        name='Adaptive Armor Fragment',
        spell_id=357972,
        base_coeff=0.038, #TODO: How to deal with ilvl?
    ),
]

AP_ABILITIES = {
    206930, # heart strike
    49998, # death strike
    327574, # sac pact
    50842, # blood boil
    194182, # marrow
    195212, # death's caress
    323798, # abom limb
    311648, # swarming mist
    324128, # death's due
    312202, # shackle
    47541, # death coil lol pls no
    352095, # pustule eruption (emeni)
    1, # auto attack (HOW THIS WORK??)
    228645, # drw heart strike (??)
    91776, # ghoul claw
    91800, # ghoul gnaw
    320660, # niya poison
    320659, # niya burrs
}

CODEX_ATTACK = 351450
