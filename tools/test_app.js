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
    formatTime, routeDistance, makeCsv, routeSequence, throughContext,
    renderStations, renderGenerator, renderTimetable,
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
assert.strictEqual(state.version, 2);
assert.strictEqual(state.lines.length, 2);
const route = state.lines[0];
const partner = state.lines[1];
assert.strictEqual(route.name, '星河線');
assert.strictEqual(route.stations.length, 8);
assert.strictEqual(route.services.length, 2);
assert.strictEqual(api.routeDistance(route).toFixed(1), '15.4');

const up = api.buildTrips(route, 'up');
const down = api.buildTrips(route, 'down');
assert.strictEqual(up.trips.length, 75);
assert.strictEqual(down.trips.length, 75);
assert.strictEqual(up.sequence.length, 13);
assert.strictEqual(down.sequence.length, 8);
assert.strictEqual(up.sequence[8].lineName, '海浜線');
assert.strictEqual(up.trips[0].through, false);
assert.strictEqual(up.trips[3].through, true);
assert.strictEqual(up.trips[3].destination, '潮見');
assert.strictEqual(typeof up.trips[0].times[partner.stations[4].id], 'undefined');
assert.strictEqual(typeof up.trips[3].times[partner.stations[4].id], 'number');
assert.strictEqual(up.trips[2].kind, '快速');
assert.strictEqual(up.trips[2].times[route.stations[1].id], null);
assert.strictEqual(api.generationStats(route).throughCount, 18);

route.overrides.up[up.trips[0].id] = {
  destination: '特別終点',
  serviceId: route.services[1].id,
  through: true
};
const overridden = api.buildTrips(route, 'up').trips[0];
assert.strictEqual(overridden.destination, '特別終点');
assert.strictEqual(overridden.kind, '快速');
assert.strictEqual(overridden.through, true);
delete route.overrides.up[up.trips[0].id];

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

const csv = api.makeCsv();
assert(csv.startsWith('"基準路線","方向","列車番号"'));
assert(csv.includes('"潮見"'));
assert.strictEqual(csv.split('\r\n').length, 1576);

assert(element('lineTabs').innerHTML.includes('海浜線'));
assert(element('lineEditor').innerHTML.includes('上り基本行先'));
api.renderStations();
assert(element('stationList').innerHTML.includes('停車する選択停車種別'));
api.renderGenerator();
assert(element('generatorEditor').innerHTML.includes('他路線への直通運転'));
assert(element('generatorEditor').innerHTML.includes('列車種別'));
api.renderTimetable();
assert(element('timetable').innerHTML.includes('data-edit-train'));
assert(element('timetable').innerHTML.includes('直通・海浜線'));
console.log('Application logic, custom service, destination, and through-service tests passed.');
