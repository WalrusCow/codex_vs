import operator
from enum import Enum

class StrBuffType(Enum):
    ADD = 1
    MUL = 2


class StrAura():
    """ One aura actually on the player """
    def __init__(self, buff, stacks=1):
        self.buff = buff
        self.stacks = stacks

    def mixout(self, strength):
        return self.buff.mixout(strength, self.stacks)

    def mixin(self, strength):
        return self.buff.mixin(strength, self.stacks)


class StrBuff():
    """ Abstract description of a strength buff spell """
    def __init__(self, name, spell_id, base_coeff, buff_type, stack_coeff=0):
        self.name = name
        self.spell_id = spell_id
        self.type = buff_type
        self._base_coeff = base_coeff
        self._stack_coeff = stack_coeff

    def mixout(self, strength, stacks):
        op = operator.sub if self.type == StrBuffType.ADD else operator.truediv
        return op(strength, self.coeff(stacks))

    def mixin(self, strength, stacks):
        op = operator.add if self.type == StrBuffType.ADD else operator.mul
        return op(strength, self.coeff(stacks))

    def coeff(self, stacks):
        if self.type == StrBuffType.ADD:
            return self._base_coeff + stacks * self._stack_coeff
        elif self.type == StrBuffType.MUL:
            return 1 + (self._base_coeff + stacks * self._stack_coeff)
