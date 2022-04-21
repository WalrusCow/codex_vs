'use strict';

const wcl_api = 'https://www.warcraftlogs.com/api/v2/client'

async function wcl_query(auth_token, query, vars) {
  const res = await fetch(wcl_api, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: query,
      variables: vars,
      operationName: null,
    }),
  });
  const json_body = await res.json();
  if (json_body.error) {
    throw new Error(`Error querying WCL API: ${json_body.error}`)
  }
  if (!res.ok) {
    throw new Error(`error querying WCL API: ${res.status}`);
  }
  return json_body.data;
}

async function query_all_events(auth_token, report_id, fight, event_type, player_id=null) {
  // TODO
  const query = `
    query getEvents(
      $report_id: String!,
      $fight_id: Int!,
      $start_time: Float!,
      $end_time: Float!,
      $event_type: EventDataType,
      $player_id: Int,
    ) {
      reportData {
        report(code: $report_id) {
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
  `;

  let events = [];
  let query_start = fight.start_time;
  while (query_start) {
    const res = await wcl_query(auth_token, query, {
      report_id: report_id,
      fight_id: fight.id,
      start_time: query_start,
      end_time: fight.end_time,
      event_type: event_type,
      player_id: player_id,
    });
    const new_events = res.reportData.report.events;
    events = events.concat(new_events.data);
    query_start = new_events.nextPageTimestamp;
  }
  return events;
}

async function list_fights(auth_token, report_id) {
  const query = `
    query getFights($report_id: String!) {
     reportData {
       report(code: $report_id) {
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
  `;
  const response = await wcl_query(auth_token, query, {
    report_id: report_id,
  });
  const report_start = response.reportData.report.startTime;
  for (var fight of response.reportData.report.fights) {
    fight.date = new Date(report_start + fight.startTime);
  }
  return response.reportData.report.fights;
}

async function list_players(auth_token, report_id, fight) {
  const players_query = `
    query getPlayers(
      $report_id: String!,
      $start_time: Float!,
      $end_time: Float!,
    ) {
      reportData {
        report(code: $report_id) {
          playerDetails (startTime: $start_time, endTime: $end_time),
          title,
          visibility,
        }
      }
    }
  `;

  let player_list = await wcl_query(auth_token, players_query, {
    report_id: report_id,
    start_time: fight.startTime,
    end_time: fight.endTime,
  });
  player_list = player_list.reportData.report.playerDetails.data.playerDetails;

  player_list = Array.prototype.concat(...Object.values(player_list));

  let result = [];
  const combat_infos = await query_all_events(auth_token, report_id, fight, 'CombatantInfo');
  for (var combat_info of combat_infos) {
    // find matching player info and add the combat info
    let player = player_list.find((p) => p.id == combat_info.id);
    player.combat_info = combat_info
    player.has_codex = !combat_info.gear.some((item) => item.id == codex_id);
  }
  return player_list;
}

export {
  list_fights,
  list_players,
  query_all_events,
};
