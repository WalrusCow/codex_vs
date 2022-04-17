import argparse
import functools
import json
import logging
import time
from datetime import datetime, date

from requests import Request, Session

import constants as c
import secrets
from str_buff import StrAura, StrBuff, StrBuffType

WCL_URL = 'https://www.warcraftlogs.com/api/v2/client'

STR_BUFF_MAP = {b.spell_id: b for b in c.STR_BUFF_LIST}

def _get_base_strength(strength, auras):
    base_strength = strength
    for aura in (a for a in auras if a.buff.type == StrBuffType.MUL):
        base_strength = aura.mixout(base_strength)
    for aura in (a for a in auras if a.buff.type == StrBuffType.ADD):
        base_strength = aura.mixout(base_strength)
    logging.debug(
        f'Got base strength {base_strength} from strength {strength}'
        f' and {len(auras)} auras.')
    return base_strength


def aura_from_json(a):
    if a['ability'] not in STR_BUFF_MAP:
        logging.debug(f'Skipping aura {a["name"]}')
        return None
    buff = STR_BUFF_MAP[a['ability']]
    return StrAura(buff, stacks=a.get('stacks', 1))

def aura_from_buff_event(e):
    if 'abilityGameID' not in e or e['abilityGameID'] not in STR_BUFF_MAP:
        logging.debug(f'Skipping aura {e.get("name",e.get("abilityGameID","unknown"))}')
        return None
    buff = STR_BUFF_MAP[e['abilityGameID']]
    return StrAura(buff, stacks=e.get('stacks', 1))

def _get_auras_from_json(json_auras):
    return [x for x in (aura_from_json(a) for a in json_auras) if x is not None]


def _wep_ilvl_to_dps(ilvl):
    #TODO lol
    return 99.3


class PlayerAuras():
    def __init__(self, aura_list):
        self._aura_map = {a.buff.spell_id: a for a in aura_list}

    def mixout_strength(self, strength):
        base_strength = strength
        for aura in (a for a in self._aura_map.values() if a.buff.type == StrBuffType.MUL):
            base_strength = aura.mixout(base_strength)
        for aura in (a for a in self._aura_map.values() if a.buff.type == StrBuffType.ADD):
            base_strength = aura.mixout(base_strength)
        logging.debug(
            f'Got base strength {base_strength} from strength {strength}'
            f' and {len(self._aura_map)} auras.'
        )
        return base_strength


    def mixin_strength(self, strength):
        total_strength = strength
        for aura in (a for a in self._aura_map.values() if a.buff.type == StrBuffType.ADD):
            total_strength = aura.mixin(total_strength)
        for aura in (a for a in self._aura_map.values() if a.buff.type == StrBuffType.MUL):
            total_strength = aura.mixin(total_strength)
        logging.debug(
            f'Got total strength {total_strength} from strength {strength}'
            f' and {len(self._aura_map)} auras.'
        )
        return total_strength

    def __len__(self):
        return len(self._aura_map)

    def __getitem__(self, key):
        if isinstance(key, StrAura):
            key = key.buff.spell_id
        if isinstance(key, StrBuff):
            key = key.spell_id
        return self._aura_map[key]

    def __contains__(self, key):
        if isinstance(key, StrAura):
            key = key.buff.spell_id
        if isinstance(key, StrBuff):
            key = key.spell_id
        return key in self._aura_map

    def __delitem__(self, key):
        if isinstance(key, StrAura):
            key = key.buff.spell_id
        if isinstance(key, StrBuff):
            key = key.spell_id
        del self._aura_map[key]

    def add(self, aura):
        if not isinstance(aura, StrAura):
            raise ValueError(f'Expected StrAura found {type(aura)}')
        self._aura_map[aura.buff.spell_id] = aura


class PlayerState():
    def __init__(self, base_strength, auras, wep_dps):
        self.base_strength = base_strength
        self.auras = auras
        self.wep_dps = wep_dps

    def get_ap(self):
        return self.auras.mixin_strength(self.base_strength) + self.wep_dps * 6



class WclReport():
    def __init__(self, report_code):
        self._auth_token = secrets.AUTH_TOKEN
        self._session = Session()
        self.report_code = report_code


    def query(self, query, **variables):
        req_body = json.dumps({
            'query': query,
            'variables': variables,
            'operationName': None,
        })
        logging.debug('request body is {}'.format(req_body))
        req = Request('POST', WCL_URL, data=req_body)
        req.headers['Authorization'] = 'Bearer {}'.format(self._auth_token)
        req.headers['Accept'] = 'application/json'
        req.headers['Content-Type'] = 'application/json'

        variables = {k: v for k, v in variables.items() if v is not None}

        res = self._session.send(self._session.prepare_request(req)).json()
        logging.debug('response is:\n{}'.format(json.dumps(res, indent=2)))
        if 'errors' in res:
            raise Exception('Response has errors:\n{}'.format(
                json.dumps(res['errors'], indent=2),
            ))
        if 'data' not in res:
            raise Exception('Response has no data:\n{}'.format(
                json.dumps(res, indent=2)
            ))
        return res['data']


    @functools.lru_cache
    def list_fights(self):
        fights_query = """
         query getFights($report_code: String!) {
           reportData {
             report(code: $report_code) {
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
         """

        fights_res = self.query(fights_query, report_code=self.report_code)
        return fights_res['reportData']['report']


    def find_fight(self, fight_id):
        fights = self.list_fights()
        for fight in fights['fights']:
            if fight['id'] == fight_id:
                return fight
        raise Exception(f'Fight {fight_id} not found')


    @functools.lru_cache
    def list_players(self, fight_id):
        players_query = """
        query getPlayers(
          $report_code: String!,
          $start_time: Float!,
          $end_time: Float!,
        ) {
          reportData {
            report(code: $report_code) {
              playerDetails (startTime: $start_time, endTime: $end_time),
              title,
              visibility,
            }
          }
        }
        """

        fight = self.find_fight(fight_id)
        start_time = fight['startTime']
        end_time = fight['endTime']

        res = self.query(players_query,
            report_code=self.report_code,
            start_time=start_time,
            end_time=end_time,
        )
        by_role = res['reportData']['report']['playerDetails']['data']['playerDetails']
        player_list = []
        for role, role_str in (('tanks', 'tank'), ('healers', 'healer'), ('dps', 'dps')):
            for p in by_role[role]:
                p['role'] = role_str
            player_list += by_role[role]
        return player_list


    def _query_all_events(
        self,
        start_time,
        end_time,
        fight_id,
        event_type=None,
        player_id=None,
    ):
        events_query = """
        query getEvents(
          $report_code: String!,
          $fight_id: Int!,
          $start_time: Float!,
          $end_time: Float!,
          $event_type: EventDataType,
          $player_id: Int,
        ) {
          reportData {
            report(code: $report_code) {
              events (
                fightIDs: [$fight_id],
                startTime: $start_time,
                endTime: $end_time,
                limit: 10000,
                translate: false,
                dataType: $event_type,
                sourceID: $player_id,
                includeResources: true,
              ) {
                data, nextPageTimestamp
              },
            },
          }
        }
        """

        events = []
        while start_time is not None:
            events_res = self.query(
                events_query,
                report_code=self.report_code,
                start_time=start_time,
                end_time=end_time,
                fight_id=fight_id,
                event_type=event_type,
                player_id=player_id,
            )['reportData']['report']['events']
            events += events_res['data']
            start_time = events_res['nextPageTimestamp']
        return events


    def get_fight(self, fight_id):
        fights = self.list_fights()
        for fight in fights['fights']:
            if fight['id'] == fight_id:
                return fight


    def list_events(self, fight_id, player_id):
        fight = self.get_fight(fight_id)
        start_time = fight['startTime']
        end_time = fight['endTime']

        events = []

        start = time.time()
        for event_type in ('DamageDone', 'Buffs', 'Casts'):
            events += self._query_all_events(
                start_time=start_time,
                end_time=end_time,
                fight_id=fight_id,
                event_type=event_type,
                player_id=player_id,
            )
        events = sorted(events, key=lambda e: e['timestamp'])
        end = time.time()
        logging.info(f'Got all {len(events)} events in {end - start}s')
        return events


    def get_initial_player_state(self, fight_id, player_id):
        fight = self.get_fight(fight_id)
        start_time = fight['startTime']
        end_time = fight['endTime']

        events = self._query_all_events(
            start_time=start_time,
            end_time=end_time,
            fight_id=fight_id,
            event_type='CombatantInfo',
            player_id=player_id,
        )
        if len(events) > 1:
            logging.warning(
                f'See {len(events)} CombatantInfo events for player {player_id}.'
                ' Considering only the first one'
            )

        player_data = events[0]
        try:
            codex_item = next(g for g in player_data['gear'] if g['id'] == c.CODEX_ID)
        except StopIteration:
            raise Exception(
                f'Player {player_id} is not wearing codex (item id {c.CODEX_ID}).'
                f'\nGear is {json.dumps(player_data["gear"], indent=2)}'
            )
        # Look at strength
        auras = PlayerAuras(_get_auras_from_json(player_data['auras']))
        p = PlayerState(
            base_strength=auras.mixout_strength(player_data['strength']),
            auras=auras,
            wep_dps=_wep_ilvl_to_dps(player_data['gear'][15]['itemLevel']),
        )

        logging.info(
            f'Player has {p.base_strength} base strength after'
            f' removing {len(p.auras)} auras'
        )
        return p


def _ms_to_str(ms):
    millis = ms % 1000
    secs = (ms // 1000) % 60
    mins = ms // 1000 // 60
    return '{}:{}.{}'.format(mins, secs, millis)


def _print_fights(wcl):
    fights_res = wcl.list_fights()
    for fight in fights_res['fights']:
        fight_name = fight['name']
        duration = _ms_to_str(fight['endTime'] - fight['startTime'])
        fight_start = datetime.fromtimestamp((fights_res['startTime'] + fight['startTime']) / 1000)
        if 'keystoneLevel' in fight:
            fight_name = '+{} {}'.format(fight['keystoneLevel'], fight_name)
        print('{fight_id}: {fight_name} {duration} ({date})'.format(
            fight_id=fight['id'],
            fight_name=fight_name,
            duration=duration,
            date=date.strftime(fight_start, '%Y-%m-%d %H:%M:%S'),
        ))
    pass


def _select_fight(wcl):
    _print_fights(wcl)
    try:
        fight_id = int(input('Select fight: '))
    except ValueError:
        raise Exception('fight must be an integer')
    return fight_id


def _print_players(wcl, fight_id):
    if fight_id is None:
        fight_id = _select_fight(wcl)

    players = wcl.list_players(fight_id)
    def _player_str(p):
        return f'{p["id"]}: {p["role"].upper()}: {p["name"]}-{p["server"]}: {p["type"]}'

    for p in players:
        print(_player_str(p))


def _select_player(wcl, fight_id):
    _print_players(wcl, fight_id)
    return input('Select player: ')


def _player_arg_to_id(wcl, fight_id, player_arg):
    if player_arg is None:
        player_arg = _select_player(wcl, fight_id)

    player_id = None
    try:
        player_id = int(player_arg)
    except ValueError:
        pass

    if isinstance(player_arg, str):
        player_name = player_arg
        logging.debug(f'turning {player_name} into player id')
        player_server = None
        if '-' in player_name:
            player_name, player_server = player_name.split('-', 1)
        for p in wcl.list_players(fight_id):
            if player_server is not None and p['server'] != player_server:
                continue
            if p['name'] != player_name:
                continue
            if isinstance(player_id, int):
                logging.warning(
                    f'Duplicate player found for {player_arg}. '
                    f' Previous id {player_id}, duplicate {p["id"]}'
                )
            player_id = p['id']
            logging.debug(f'got id {player_id} for {player_arg}')
    return player_id


def _print_events(wcl, fight_id, player_arg):
    if fight_id is None:
        fight_id = _select_fight(wcl)
    player_id = _player_arg_to_id(wcl, fight_id, player_arg)
    events = wcl.list_events(
        fight_id=fight_id,
        player_id=player_id,
    )

    print(f'Read {len(events)} events')


def _is_codex_good(wcl, fight_id, player_arg):
    if fight_id is None:
        fight_id = _select_fight(wcl)
    player_id = _player_arg_to_id(wcl, fight_id, player_arg)

    player_state = wcl.get_initial_player_state(fight_id, player_id)
    events = wcl.list_events(fight_id, player_id)

    latest_ap = None

    added_strength_damage = 0
    codex_damage = 0

    for e in events:
        t = e['type']
        if t == 'applybuff' or t == 'applybuffstack':
            aura = aura_from_buff_event(e)
            if aura is None:
                # uninteresting aura
                continue
            # check if this is actually applied to player
            if e['abilityGameID'] == 342181 and aura in player_state.auras:
                    player_state.auras[aura].stacks += 1
            if e['targetID'] != player_id:
                continue
            player_state.auras.add(aura)

        elif t == 'removebuff':
            aura = aura_from_buff_event(e)
            if aura is None or e['targetID'] != player_id:
                continue
            # just remove the buff yep
            del player_state.auras[aura]

        elif t == 'damage':
            damage_done = e['amount'] + e.get('absorbed', 0)
            if e['abilityGameID'] == c.CODEX_ATTACK:
                codex_damage += damage_done
            elif e['abilityGameID'] in c.AP_ABILITIES:
                dmg_coeff = damage_done / latest_ap
                ap_coeff = latest_ap / player_state.get_ap()
                player_state.base_strength += 125
                new_damage = player_state.get_ap() * ap_coeff * dmg_coeff
                player_state.base_strength -= 125
                if new_damage < damage_done:
                    raise Exception(
                        f'More strength is less dmg? {new_damage} {damage_done}'
                        f'{ap_coeff} {dmg_coeff} {player_state.get_ap()}'
                    )
                added_strength_damage += (new_damage - damage_done)

        elif t == 'cast' and e.get('attackPower', 0) > 0:
            latest_ap = e['attackPower']
    added_strength_damage = int(added_strength_damage)
    effective_codex_damage = codex_damage - added_strength_damage

    fight = wcl.find_fight(fight_id)
    fight_duration = fight['endTime'] - fight['startTime']
    codex_dps = effective_codex_damage / fight_duration * 1000
    combat_time = sum(p['endTime'] - p['startTime'] for p in fight['dungeonPulls'])
    codex_dps_combat = effective_codex_damage / combat_time * 1000
    print(
        f'Codex damage: {codex_damage}'
        f'\nStrength damage: {added_strength_damage}'
        f'\nEffective codex damage: {effective_codex_damage}'
        f'\nEffective codex dps: {codex_dps:.1f}'
        f'\nEffective codex dps (combat): {codex_dps_combat:.1f}'
    )


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="toy cli")
    parser.add_argument('action',
        type=str,
        choices=['fights', 'players', 'events', 'codex'],
    )
    parser.add_argument('code', type=str)
    parser.add_argument('--fight', type=int)
    parser.add_argument('--player', type=str)
    parser.add_argument('--loglevel', type=str, default='WARNING')
    parser.add_argument('-v', action='store_true')
    args = parser.parse_args()

    logging.basicConfig(
        format='%(levelname)s: %(asctime)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        level=logging.DEBUG if args.v else getattr(logging, args.loglevel.upper()),
    )

    if args.action == 'fights':
        _print_fights(WclReport(args.code))
    if args.action == 'players':
        _print_players(WclReport(args.code), args.fight)
    if args.action == 'events':
        _print_events(WclReport(args.code), args.fight, args.player)
    if args.action == 'codex':
        _is_codex_good(WclReport(args.code), args.fight, args.player)

