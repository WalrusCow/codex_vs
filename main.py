import argparse
import json
import logging
import time
from datetime import datetime, date

from requests import Request, Session

import secrets

WCL_URL = 'https://www.warcraftlogs.com/api/v2/client'


class WclReport():
    def __init__(self, report_code):
        self._auth_token = secrets.AUTH_TOKEN
        self._session = Session()
        self.report_code = report_code

    def query(self, query, **variables):
        req_body = json.dumps({'query': query, 'variables': variables, 'operationName': None})
        logging.debug('request body is {}'.format(req_body))
        req = Request('POST', WCL_URL, data=req_body)
        req.headers['Authorization'] = 'Bearer {}'.format(self._auth_token)
        req.headers['Accept'] = 'application/json'
        req.headers['Content-Type'] = 'application/json'

        res = self._session.send(self._session.prepare_request(req)).json()
        logging.debug('response is:\n{}'.format(json.dumps(res, indent=2)))
        if 'errors' in res:
            raise Exception('Response has errors:\n{}'.format(json.dumps(res['errors'], indent=2)))
        if 'data' not in res:
            raise Exception('Response has no data:\n{}'.format(json.dumps(res, indent=2)))
        return res['data']


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
                 difficulty,
                 keystoneBonus,
                 keystoneLevel,
                 keystoneTime,
                 name,
                 rating,
                 size,
                 startTime
               }
             }
           }
         }
         """

        fights_res = self.query(fights_query, report_code=self.report_code)
        return fights_res['reportData']['report']


    def list_players(self, fight_id):
        players_query = """
        query getPlayers($report_code: String!, $start_time: Float!, $end_time: Float!) {
          reportData {
            report(code: $report_code) {
              playerDetails (startTime: $start_time, endTime: $end_time),
              title,
              visibility,
            }
          }
        }
        """

        fights = self.list_fights()
        for fight in fights['fights']:
            if fight['id'] == fight_id:
                start_time = fight['startTime']
                end_time = fight['endTime']

        res = self.query(players_query, report_code=self.report_code, start_time=start_time, end_time=end_time)
        by_role = res['reportData']['report']['playerDetails']['data']['playerDetails']
        player_list = []
        for role, role_str in (('tanks', 'tank'), ('healers', 'healer'), ('dps', 'dps')):
            for p in by_role[role]:
                p['role'] = role_str
            player_list += by_role[role]
        return player_list


    def _query_all_events(self, start_time, end_time, fight_id, event_type):
        events_query = """
        query getEvents(
          $report_code: String!,
          $fight_id: Int!,
          $start_time: Float!,
          $end_time: Float!,
          $event_type: EventDataType!,
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
            )['reportData']['report']['events']
            events += events_res['data']
            start_time = events_res['nextPageTimestamp']
        return events




    def list_events(self, fight_id, player_id):
        fights = self.list_fights()
        for fight in fights['fights']:
            if fight['id'] == fight_id:
                start_time = fight['startTime']
                end_time = fight['endTime']

        events = []

        start = time.time()
        for event_type in ('DamageDone', 'Buffs', 'Debuffs'):
            events += self._query_all_events(
                start_time=start_time,
                end_time=end_time,
                fight_id=fight_id,
                event_type=event_type,
            )
        end = time.time()
        logging.debug(f'Got all {len(events)} events in {end - start}s')
        return events


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


def _print_events(wcl, fight_id, player_arg):
    if fight_id is None:
        fight_id = _select_fight(wcl)
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
            logging.debug(f'looking @ player {p}')
            if player_server is not None and p['server'] != player_server:
                continue
            if p['name'] != player_name:
                continue
            if isinstance(player_id, int):
                logging.warning(f'Duplicate player found for {player_arg}. Previous id {player_id}, duplicate {p["id"]}')
            player_id = p['id']
            logging.debug(f'got id {player_id} for {player_arg}')

    events = wcl.list_events(
        fight_id=fight_id,
        player_id=player_id,
    )

    print(f'Read {len(events)} events')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="toy cli")
    parser.add_argument('action', type=str, choices=['fights', 'players', 'events'])
    parser.add_argument('code', type=str)
    parser.add_argument('--fight', type=int)
    parser.add_argument('--player', type=str)
    parser.add_argument('--loglevel', type=str, default='INFO')
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

