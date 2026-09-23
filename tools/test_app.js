#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class FakeClassList { add() {} remove() {} toggle() {} }
class FakeElement {
  constructor() {
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.hidden = true;
    this.dataset = {};
    this.style = {};
    this.classList = new FakeClassList();
  }
  addEventListener() {}
  focus() {}
  select() {}
  closest() { return null; }
}

const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) elements.set(id, new FakeElement());
  return elements.get(id);
};
const navButtons = ['lines', 'stations', 'generate', 'timetable'].map((name) => {
  const item = new FakeElement();
  item.dataset.nav = name;
  return item;
});
const storage = new Map();
const documentMock = {
  body: new FakeElement(),
  querySelector(selector) { return selector.startsWith('#') ? element(selector.slice(1)) : new FakeElement(); },
  querySelectorAll(selector) { return selector === '.bottom-nav button' ? navButtons : []; },
  addEventListener() {},
  execCommand() { return true; }
};

const sourcePath = path.resolve(__dirname, '../app/src/main/assets/app.js');
let source = fs.readFileSync(sourcePath, 'utf8');
const marker = '  renderLineTabs(); renderLineEditor();';
assert(source.includes(marker), 'Test export injection point was not found');
source = source.replace(marker, `
  globalThis.__diaTest = {
    defaultState, sanitizeState, buildTrips, scheduleFor, generationStats,
    formatTime, routeDistance, makeCsv, routeSequence, throughContext, branchContexts, stationTimeKey,
    renderStations, renderGenerator, renderTimetable, openTrainEditor,
    getState: () => state
  };
${marker}`);

const context = {
  console,
  document: documentMock,
  window: { scrollTo() {} },
  navigator: {},
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, value); }
  },
  setTimeout() { return 1; },
  clearTimeout() {},
  globalThis: null
};
context.globalThis = context;
vm.runInNewContext(source, context, { filename: 'app.js' });

const api = context.__diaTest;
const state = api.getState();
assert.strictEqual(state.version, 6);
assert.strictEqual(state.lines.length, 2);
const route = state.lines[0];
const partner = state.lines[1];
assert.strictEqual(route.name, '星河線');
assert.strictEqual(route.stations.length, 8);
assert.strictEqual(route.services.length, 2);
assert.strictEqual(route.branches.length, 0);
assert.strictEqual(api.routeDistance(route).toFixed(1), '15.4');

const up = api.buildTrips(route, 'up');
const down = api.buildTrips(route, 'down');
assert.strictEqual(up.trips.length, 75);
assert.strictEqual(down.trips.length, 75);
assert.strictEqual(up.sequence.length, 8);
assert.strictEqual(down.sequence.length, 8);
assert.strictEqual(up.trips[0].through, false);
assert.strictEqual(up.trips[3].through, true);
assert.strictEqual(up.trips[3].destination, '潮見');
assert.strictEqual(up.trips[3].throughLineName, '海浜線');
assert.strictEqual(up.trips[3].throughDirectionLabel, '潮見方面');
assert.strictEqual(up.trips[3].throughServiceName, '普通');
assert.strictEqual(up.trips[0].platform, '1');
assert.strictEqual(up.trips[0].stopTimes[route.stations[0].id].departure, up.trips[0].departure);
assert.strictEqual(up.trips[2].stopTimes[route.stations[1].id].stop, false);
assert.strictEqual(typeof up.trips[0].times[partner.stations[4].id], 'undefined');
assert.strictEqual(typeof up.trips[3].times[partner.stations[4].id], 'undefined');
assert.strictEqual(up.trips[2].kind, '快速');
assert.strictEqual(up.trips[2].times[route.stations[1].id], null);
assert.strictEqual(api.generationStats(route).throughCount, 18);

route.overrides.up[up.trips[0].id] = {
  destination: '特別終点',
  serviceId: route.services[1].id,
  through: true,
  platform: '4',
  departure: up.trips[0].scheduledDeparture + 5,
  stationStops: { [route.stations[1].id]: true },
  stationTimes: { [route.stations[1].id]: { arrival: 333, departure: 334 } }
};
const overridden = api.buildTrips(route, 'up').trips[0];
assert.strictEqual(overridden.destination, '特別終点');
assert.strictEqual(overridden.kind, '快速');
assert.strictEqual(overridden.through, true);
assert.strictEqual(overridden.platform, '4');
assert.strictEqual(overridden.departure, up.trips[0].scheduledDeparture + 5);
assert.strictEqual(overridden.stopTimes[route.stations[1].id].stop, true);
assert.strictEqual(overridden.stopTimes[route.stations[1].id].arrival, 333);
assert.strictEqual(overridden.stopTimes[route.stations[1].id].departure, 334);
assert.strictEqual(overridden.times[route.stations[1].id], 333);
delete route.overrides.up[up.trips[0].id];

route.overrides.up[up.trips[1].id] = { terminalStationKey: route.stations[4].id };
const shortTurn = api.buildTrips(route, 'up').trips[1];
assert.strictEqual(shortTurn.customTerminal, true);
assert.strictEqual(shortTurn.destination, route.stations[4].name);
assert.strictEqual(shortTurn.terminalStationKey, route.stations[4].id);
assert.strictEqual(shortTurn.terminalStationName, route.stations[4].name);
assert.strictEqual(shortTurn.stationSequence.length, 5);
assert.strictEqual(shortTurn.fullStationSequence.length, 8);
assert.strictEqual(shortTurn.stopTimes[route.stations[4].id].terminal, true);
assert.strictEqual(shortTurn.stopTimes[route.stations[4].id].departure, shortTurn.stopTimes[route.stations[4].id].arrival);
assert.strictEqual(typeof shortTurn.times[route.stations[5].id], 'undefined');
delete route.overrides.up[up.trips[1].id];

route.overrides.up[up.trips[3].id] = { terminalStationKey: route.stations[3].id };
const shortThrough = api.buildTrips(route, 'up').trips[3];
assert.strictEqual(shortThrough.customTerminal, true);
assert.strictEqual(shortThrough.through, false);
assert.strictEqual(shortThrough.throughLineName, '');
assert.strictEqual(shortThrough.destination, route.stations[3].name);
delete route.overrides.up[up.trips[3].id];

const branch = {
  id: 'branch-test', enabled: true, name: '空港支線',
  junctionStationId: route.stations[3].id,
  targetLineId: partner.id, outboundDirection: 'up', targetDirection: 'up',
  every: 5, layover: 2, targetServiceId: partner.services[0].id, destination: '空港中央'
};
route.branches.push(branch);
const branchUp = api.buildTrips(route, 'up');
const branchUpContext = api.branchContexts(route, 'up')[0];
const outboundBranchTrip = branchUp.trips[4];
assert.strictEqual(branchUp.sequence.length, 13);
assert.strictEqual(outboundBranchTrip.branchId, branch.id);
assert.strictEqual(outboundBranchTrip.branchName, '空港支線');
assert.strictEqual(outboundBranchTrip.destination, '空港中央');
assert.strictEqual(outboundBranchTrip.through, false);
assert.strictEqual(typeof outboundBranchTrip.times[route.stations[4].id], 'undefined');
assert.strictEqual(typeof outboundBranchTrip.times[api.stationTimeKey(branchUpContext.sequence[4])], 'number');

const branchTerminalKey = api.stationTimeKey(branchUpContext.sequence[2]);
route.overrides.up[outboundBranchTrip.id] = { branchId: branch.id, terminalStationKey: branchTerminalKey };
const shortBranchTrip = api.buildTrips(route, 'up').trips[4];
assert.strictEqual(shortBranchTrip.customTerminal, true);
assert.strictEqual(shortBranchTrip.terminalStationKey, branchTerminalKey);
assert.strictEqual(shortBranchTrip.destination, branchUpContext.sequence[2].name);
assert.strictEqual(typeof shortBranchTrip.times[api.stationTimeKey(branchUpContext.sequence[3])], 'undefined');
delete route.overrides.up[outboundBranchTrip.id];

const branchDown = api.buildTrips(route, 'down');
const branchDownContext = api.branchContexts(route, 'down')[0];
const returningBranchTrip = branchDown.trips[4];
assert.strictEqual(returningBranchTrip.branchId, branch.id);
assert.strictEqual(returningBranchTrip.destination, route.downDestination);
assert.strictEqual(returningBranchTrip.times[api.stationTimeKey(branchDownContext.sequence[0])], returningBranchTrip.departure);
assert.strictEqual(typeof returningBranchTrip.times[route.stations[7].id], 'undefined');
assert.strictEqual(typeof returningBranchTrip.times[route.stations[3].id], 'number');
assert.strictEqual(api.generationStats(route).branchCount, 30);

route.overrides.up[outboundBranchTrip.id] = { branchId: 'none' };
const forcedMainTrip = api.buildTrips(route, 'up').trips[4];
assert.strictEqual(forcedMainTrip.branchId, '');
assert.strictEqual(typeof forcedMainTrip.times[route.stations[4].id], 'number');
delete route.overrides.up[outboundBranchTrip.id];
route.overrides.up[branchUp.trips[0].id] = { branchId: branch.id };
assert.strictEqual(api.buildTrips(route, 'up').trips[0].branchId, branch.id);
delete route.overrides.up[branchUp.trips[0].id];
route.branches = [];

const overnight = JSON.parse(JSON.stringify(route));
overnight.settings.first = '23:00';
overnight.settings.last = '01:00';
overnight.settings.headway = 30;
assert.strictEqual(api.buildTrips(overnight, 'up').trips.length, 5);
assert.strictEqual(api.formatTime(1470), '翌 00:30');

const legacy = api.sanitizeState({
  selectedId: 'legacy',
  lines: [{
    id: 'legacy', name: '旧路線', code: 'LG', color: '#123456',
    settings: { first: '06:00', last: '22:00', headway: 10, speed: 40, rapidEvery: 3 },
    stations: [
      { id: 'a', name: 'A', km: 0, dwell: 40, rapid: true },
      { id: 'b', name: 'B', km: 2, dwell: 40, rapid: false },
      { id: 'c', name: 'C', km: 2, dwell: 40, rapid: true }
    ]
  }]
});
assert.strictEqual(legacy.lines[0].services[1].every, 3);
assert(legacy.lines[0].stations[0].stops.includes(legacy.lines[0].services[1].id));
assert.strictEqual(legacy.lines[0].through.up.enabled, false);
assert.strictEqual(legacy.lines[0].branches.length, 0);

const importCandidate = JSON.parse(JSON.stringify({ selectedId: route.id, lines: [route, partner] }));
importCandidate.lines[0].through.up = {
  enabled: true, targetLineId: partner.id, targetDirection: 'up',
  every: 4, layover: 3, targetServiceId: partner.services[0].id,
  destination: ''
};
importCandidate.lines[0].overrides.up.SR001A = {
  platform: '7番線', departure: 370, terminalStationKey: route.stations[4].id,
  stationStops: { [route.stations[1].id]: false, invalid: 'no' },
  stationTimes: { [route.stations[2].id]: { arrival: 380, departure: 381 }, invalid: { arrival: 'bad' } }
};
importCandidate.lines[0].branches = [{
  id: 'imported-branch', enabled: true, name: '輸入支線',
  junctionStationId: route.stations[2].id, targetLineId: partner.id,
  outboundDirection: 'down', targetDirection: 'down', every: 99, layover: -3,
  targetServiceId: 'missing-service', destination: '輸入終点'
}];
const imported = api.sanitizeState(importCandidate);
assert.strictEqual(imported.lines[0].branches[0].enabled, true);
assert.strictEqual(imported.lines[0].branches[0].every, 20);
assert.strictEqual(imported.lines[0].branches[0].layover, 0);
assert.strictEqual(imported.lines[0].branches[0].targetServiceId, imported.lines[1].services[0].id);
assert.strictEqual(imported.lines[0].through.up.lineName, '海浜線');
assert.strictEqual(imported.lines[0].through.up.directionLabel, '潮見方面');
assert.strictEqual(imported.lines[0].through.up.serviceName, '普通');
assert.strictEqual(imported.lines[0].through.up.destination, '潮見');
assert.strictEqual('targetLineId' in imported.lines[0].through.up, false);
assert.strictEqual(imported.lines[0].overrides.up.SR001A.platform, '7番線');
assert.strictEqual(imported.lines[0].overrides.up.SR001A.departure, 370);
assert.strictEqual(imported.lines[0].overrides.up.SR001A.terminalStationKey, route.stations[4].id);
assert.strictEqual(imported.lines[0].overrides.up.SR001A.stationStops[route.stations[1].id], false);
assert.strictEqual('invalid' in imported.lines[0].overrides.up.SR001A.stationStops, false);
assert.strictEqual(imported.lines[0].overrides.up.SR001A.stationTimes[route.stations[2].id].departure, 381);

const soloRoute = JSON.parse(JSON.stringify(route));
soloRoute.through.up = {
  enabled: true, lineName: '自由線', directionLabel: '自由方面', every: 1,
  layover: 2, serviceName: '急行', destination: '自由終点'
};
const soloTrip = api.buildTrips(soloRoute, 'up', { lines: [soloRoute] }).trips[0];
assert.strictEqual(soloTrip.through, true);
assert.strictEqual(soloTrip.destination, '自由終点');
assert.strictEqual(soloTrip.throughLineName, '自由線');
assert.strictEqual(soloTrip.throughDirectionLabel, '自由方面');
assert.strictEqual(soloTrip.throughServiceName, '急行');
assert.strictEqual(Object.keys(soloTrip.times).length, route.stations.length);

const csv = api.makeCsv();
assert(csv.startsWith('"基準路線","方向","列車番号"'));
assert(csv.includes('"支線"'));
assert(csv.includes('"直通路線"'));
assert(csv.includes('"発車番線"'));
assert(csv.includes('"運転終点"'));
assert(csv.includes('"中間駅終着"'));
assert(csv.includes('"到着時刻"'));
assert(csv.includes('"発車時刻"'));
assert(csv.includes('"海浜線"'));
assert(csv.includes('"潮見"'));
assert.strictEqual(csv.split('\r\n').length, 1201);

assert(element('lineTabs').innerHTML.includes('海浜線'));
assert(element('lineEditor').innerHTML.includes('上り基本行先'));
api.renderStations();
assert(element('stationList').innerHTML.includes('停車する選択停車種別'));
api.renderGenerator();
assert(element('generatorEditor').innerHTML.includes('他路線への直通運転'));
assert(element('generatorEditor').innerHTML.includes('直通先路線名'));
assert(element('generatorEditor').innerHTML.includes('data-through-field="lineName"'));
assert(!element('generatorEditor').innerHTML.includes('data-through-field="targetLineId"'));
assert(element('generatorEditor').innerHTML.includes('支線運転'));
assert(element('generatorEditor').innerHTML.includes('列車種別'));
api.renderTimetable();
assert(element('timetable').innerHTML.includes('data-edit-train'));
assert(element('timetable').innerHTML.includes('↗ 海浜線・潮見ゆき'));
assert(element('timetable').innerHTML.includes('番線'));
api.openTrainEditor(up.trips[0].id);
assert(element('modalContent').innerHTML.includes('停車駅情報'));
assert(element('modalContent').innerHTML.includes('id="editTrainDeparture"'));
assert(element('modalContent').innerHTML.includes('id="editTrainPlatform"'));
assert(element('modalContent').innerHTML.includes('id="editTrainTerminal"'));
assert(element('modalContent').innerHTML.includes('中間駅を選ぶと'));
assert(element('modalContent').innerHTML.includes('data-train-stop-key'));
assert(element('modalContent').innerHTML.includes('data-train-time-field="arrival"'));
route.overrides.up[up.trips[0].id] = { terminalStationKey: route.stations[3].id };
api.renderTimetable();
assert(element('timetable').innerHTML.includes(`止 ${route.stations[3].name}ゆき`));
api.openTrainEditor(up.trips[0].id);
assert(element('modalContent').innerHTML.includes('<span class="terminal-badge">終点</span>'));
delete route.overrides.up[up.trips[0].id];
console.log('Application logic, editable intermediate terminus, stop times, platform, service, destination, branch, and through-service tests passed.');
