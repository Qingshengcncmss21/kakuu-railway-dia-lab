(() => {
  'use strict';

  const STORAGE_KEY = 'kakuu-railway-dia-lab-v1';
  const APP_VERSION = 5;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const esc = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const colorOf = (value, fallback = '#3859e8') => /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : fallback;
  const padNumber = (value, width) => {
    let result = String(value);
    while (result.length < width) result = `0${result}`;
    return result;
  };
  const numberOf = (value, fallback, min, max) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const cleanPlatform = (value) => String(value || '').trim().slice(0, 12);
  const platformLabel = (value) => {
    const platform = cleanPlatform(value);
    return platform ? (/番線$/.test(platform) ? platform : `${platform}番線`) : '番線未設定';
  };
  const safeMinute = (value) => value !== null && value !== '' && Number.isFinite(Number(value)) ? Math.round(numberOf(value, 0, 0, 10079)) : null;

  const newService = (name, shortName, color, every, allStops) => ({
    id: makeId('svc'), name, short: shortName, color, every, allStops
  });

  const defaultServices = (rapidEvery = 3) => [
    newService('普通', '普', '#41506e', 1, true),
    newService('快速', '快', '#c43d52', rapidEvery > 0 ? rapidEvery : 0, false)
  ];

  const emptyThrough = () => ({
    enabled: false, lineName: '', directionLabel: '', every: 4,
    layover: 3, serviceName: '', destination: ''
  });

  const emptyBranch = (route, target) => ({
    id: makeId('branch'),
    enabled: true,
    name: target ? `${target.name}支線` : '新しい支線',
    junctionStationId: route && route.stations.length ? route.stations[Math.floor(route.stations.length / 2)].id : '',
    targetLineId: target ? target.id : '',
    outboundDirection: 'up',
    targetDirection: 'up',
    every: 4,
    layover: 2,
    targetServiceId: target && target.services.length ? target.services[0].id : '',
    destination: ''
  });

  function makeDemoLine() {
    const services = defaultServices(3);
    const rapidId = services[1].id;
    return {
      id: makeId('line'), operator: '蒼穹鉄道', name: '星河線', code: 'SR', color: '#3859e8',
      upLabel: '蒼穹港方面', downLabel: '星見中央方面',
      upDestination: '蒼穹港', downDestination: '星見中央', services,
      stations: [
        ['星見中央', 0, 60, true], ['天文台前', 1.8, 40, false], ['青葉台', 2.4, 45, true],
        ['月影', 1.6, 35, false], ['みなと公園', 3.1, 50, true], ['海風', 2.2, 40, false],
        ['白波', 1.7, 40, false], ['蒼穹港', 2.6, 60, true]
      ].map((item) => ({ id: makeId('st'), name: item[0], km: item[1], dwell: item[2], stops: item[3] ? [rapidId] : [] })),
      settings: { first: '05:10', last: '23:40', headway: 15, speed: 48 },
      branches: [],
      through: { up: emptyThrough(), down: emptyThrough() },
      overrides: { up: {}, down: {} }
    };
  }

  function makePartnerLine() {
    const services = defaultServices(4);
    const rapidId = services[1].id;
    return {
      id: makeId('line'), operator: '蒼穹鉄道', name: '海浜線', code: 'CB', color: '#009b8e',
      upLabel: '潮見方面', downLabel: '蒼穹港方面', upDestination: '潮見', downDestination: '蒼穹港', services,
      stations: [
        ['蒼穹港', 0, 60, true], ['新埠頭', 2.1, 40, false], ['海浜中央', 3.4, 50, true],
        ['灯台前', 2.5, 35, false], ['潮見', 2.8, 60, true]
      ].map((item) => ({ id: makeId('st'), name: item[0], km: item[1], dwell: item[2], stops: item[3] ? [rapidId] : [] })),
      settings: { first: '05:30', last: '23:30', headway: 20, speed: 46 },
      branches: [],
      through: { up: emptyThrough(), down: emptyThrough() },
      overrides: { up: {}, down: {} }
    };
  }

  function blankLine(index = 1) {
    const services = defaultServices(0);
    return {
      id: makeId('line'), operator: '架空鉄道', name: `新設路線 ${index}`,
      code: `F${index}`.slice(0, 3).toUpperCase(),
      color: ['#e3474f', '#009c8c', '#e08318', '#7048c6'][index % 4],
      upLabel: '終点方面', downLabel: '起点方面', upDestination: '終点', downDestination: '起点', services,
      stations: [
        { id: makeId('st'), name: '起点', km: 0, dwell: 60, stops: [services[1].id] },
        { id: makeId('st'), name: '終点', km: 2, dwell: 60, stops: [services[1].id] }
      ],
      settings: { first: '05:30', last: '23:30', headway: 20, speed: 45 },
      branches: [],
      through: { up: emptyThrough(), down: emptyThrough() },
      overrides: { up: {}, down: {} }
    };
  }

  const defaultState = () => {
    const main = makeDemoLine();
    const partner = makePartnerLine();
    main.through.up = {
      enabled: true, lineName: '海浜線', directionLabel: '潮見方面', every: 4,
      layover: 3, serviceName: '普通', destination: '潮見'
    };
    return { version: APP_VERSION, selectedId: main.id, lines: [main, partner] };
  };

  function sanitizeServices(rawServices, legacyRapidEvery) {
    const source = Array.isArray(rawServices) && rawServices.length ? rawServices.slice(0, 12) : defaultServices(legacyRapidEvery);
    const usedIds = new Set();
    const services = source.map((service, index) => {
      let id = typeof (service && service.id) === 'string' ? service.id : makeId('svc');
      if (usedIds.has(id)) id = makeId('svc');
      usedIds.add(id);
      const everyRaw = Math.round(numberOf(service && service.every, index === 0 ? 1 : 0, 0, 20));
      return {
        id,
        name: String((service && service.name) || (index === 0 ? '普通' : `種別 ${index + 1}`)).slice(0, 20),
        short: String((service && service.short) || (index === 0 ? '普' : '種')).slice(0, 3),
        color: colorOf(service && service.color, index === 0 ? '#41506e' : '#c43d52'),
        every: index === 0 ? 1 : (everyRaw === 1 ? 2 : everyRaw),
        allStops: index === 0 ? true : Boolean(service && service.allStops)
      };
    });
    services[0].every = 1;
    return services;
  }

  function sanitizeStation(station, index, services, legacyRapidId) {
    const validServiceIds = new Set(services.map((service) => service.id));
    let stops = Array.isArray(station && station.stops)
      ? station.stops.filter((id) => validServiceIds.has(id)) : [];
    if (!Array.isArray(station && station.stops) && station && station.rapid && legacyRapidId) stops.push(legacyRapidId);
    stops = [...new Set(stops)];
    return {
      id: typeof (station && station.id) === 'string' ? station.id : makeId('st'),
      name: String((station && station.name) || `駅 ${index + 1}`).slice(0, 40),
      km: index === 0 ? 0 : numberOf(station && station.km, 1, .1, 99.9),
      dwell: Math.round(numberOf(station && station.dwell, 40, 0, 600)), stops
    };
  }

  function sanitizeOverrides(raw, services, branches) {
    const validIds = new Set(services.map((service) => service.id));
    const validBranchIds = new Set((branches || []).map((branch) => branch.id));
    const result = { up: {}, down: {} };
    ['up', 'down'].forEach((dir) => {
      const entries = raw && raw[dir] && typeof raw[dir] === 'object' ? Object.keys(raw[dir]).slice(0, 500) : [];
      entries.forEach((trainId) => {
        const item = raw[dir][trainId] || {};
        const clean = {};
        if (validIds.has(item.serviceId)) clean.serviceId = item.serviceId;
        if (typeof item.destination === 'string' && item.destination.trim()) clean.destination = item.destination.trim().slice(0, 40);
        if (item.through === true || item.through === false) clean.through = item.through;
        if (item.branchId === 'none' || validBranchIds.has(item.branchId)) clean.branchId = item.branchId;
        if (typeof item.platform === 'string' && item.platform.trim()) clean.platform = cleanPlatform(item.platform);
        const departure = safeMinute(item.departure);
        if (departure !== null) clean.departure = departure;
        if (item.stationStops && typeof item.stationStops === 'object') {
          const stationStops = {};
          Object.keys(item.stationStops).slice(0, 120).forEach((key) => {
            if (key.length <= 100 && (item.stationStops[key] === true || item.stationStops[key] === false)) stationStops[key] = item.stationStops[key];
          });
          if (Object.keys(stationStops).length) clean.stationStops = stationStops;
        }
        if (item.stationTimes && typeof item.stationTimes === 'object') {
          const stationTimes = {};
          Object.keys(item.stationTimes).slice(0, 120).forEach((key) => {
            if (key.length > 100) return;
            const source = item.stationTimes[key]; const point = {};
            const arrival = safeMinute(source && source.arrival); const stationDeparture = safeMinute(source && source.departure);
            if (arrival !== null) point.arrival = arrival;
            if (stationDeparture !== null) point.departure = stationDeparture;
            if (Object.keys(point).length) stationTimes[key] = point;
          });
          if (Object.keys(stationTimes).length) clean.stationTimes = stationTimes;
        }
        if (Object.keys(clean).length) result[dir][String(trainId).slice(0, 30)] = clean;
      });
    });
    return result;
  }

  function sanitizeThrough(raw) {
    return {
      enabled: Boolean(raw && raw.enabled),
      lineName: String((raw && raw.lineName) || '').slice(0, 40),
      directionLabel: String((raw && raw.directionLabel) || '').slice(0, 40),
      every: Math.round(numberOf(raw && raw.every, 4, 1, 20)),
      layover: Math.round(numberOf(raw && raw.layover, 3, 0, 60)),
      serviceName: String((raw && raw.serviceName) || '').slice(0, 20),
      destination: String((raw && raw.destination) || '').slice(0, 40),
      legacyTargetLineId: typeof (raw && raw.targetLineId) === 'string' ? raw.targetLineId : '',
      legacyTargetDirection: raw && raw.targetDirection === 'down' ? 'down' : 'up',
      legacyTargetServiceId: typeof (raw && raw.targetServiceId) === 'string' ? raw.targetServiceId : ''
    };
  }

  function sanitizeBranches(rawBranches, stations) {
    const source = Array.isArray(rawBranches) ? rawBranches.slice(0, 6) : [];
    const usedIds = new Set();
    const stationIds = new Set(stations.map((station) => station.id));
    const defaultJunction = stations[Math.floor(stations.length / 2)].id;
    return source.map((raw, index) => {
      let id = typeof (raw && raw.id) === 'string' ? raw.id : makeId('branch');
      if (usedIds.has(id)) id = makeId('branch');
      usedIds.add(id);
      return {
        id,
        enabled: Boolean(raw && raw.enabled),
        name: String((raw && raw.name) || `支線 ${index + 1}`).slice(0, 40),
        junctionStationId: stationIds.has(raw && raw.junctionStationId) ? raw.junctionStationId : defaultJunction,
        targetLineId: typeof (raw && raw.targetLineId) === 'string' ? raw.targetLineId : '',
        outboundDirection: raw && raw.outboundDirection === 'down' ? 'down' : 'up',
        targetDirection: raw && raw.targetDirection === 'down' ? 'down' : 'up',
        every: Math.round(numberOf(raw && raw.every, 4, 1, 20)),
        layover: Math.round(numberOf(raw && raw.layover, 2, 0, 60)),
        targetServiceId: typeof (raw && raw.targetServiceId) === 'string' ? raw.targetServiceId : '',
        destination: String((raw && raw.destination) || '').slice(0, 40)
      };
    });
  }

  function sanitizeLine(raw, index) {
    const fallback = blankLine(index + 1);
    const legacyRapidEvery = Math.round(numberOf(raw && raw.settings && raw.settings.rapidEvery, 0, 0, 20));
    const services = sanitizeServices(raw && raw.services, legacyRapidEvery);
    const rapidService = services.find((service) => service.name === '快速') || services[1];
    const rawStations = Array.isArray(raw && raw.stations) ? raw.stations.slice(0, 80) : fallback.stations;
    const stations = rawStations.map((station, stationIndex) => sanitizeStation(station, stationIndex, services, rapidService && rapidService.id));
    while (stations.length < 2) stations.push(sanitizeStation({}, stations.length, services, null));
    stations[0].km = 0;
    const branches = sanitizeBranches(raw && raw.branches, stations);
    return {
      id: typeof (raw && raw.id) === 'string' ? raw.id : makeId('line'),
      operator: String((raw && raw.operator) || fallback.operator).slice(0, 40),
      name: String((raw && raw.name) || fallback.name).slice(0, 40),
      code: String((raw && raw.code) || fallback.code).replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'FR',
      color: colorOf(raw && raw.color),
      upLabel: String((raw && raw.upLabel) || fallback.upLabel).slice(0, 40),
      downLabel: String((raw && raw.downLabel) || fallback.downLabel).slice(0, 40),
      upDestination: String((raw && raw.upDestination) || stations[stations.length - 1].name).slice(0, 40),
      downDestination: String((raw && raw.downDestination) || stations[0].name).slice(0, 40),
      services, stations, branches,
      settings: {
        first: /^\d{2}:\d{2}$/.test(raw && raw.settings && raw.settings.first) ? raw.settings.first : fallback.settings.first,
        last: /^\d{2}:\d{2}$/.test(raw && raw.settings && raw.settings.last) ? raw.settings.last : fallback.settings.last,
        headway: Math.round(numberOf(raw && raw.settings && raw.settings.headway, 15, 2, 180)),
        speed: Math.round(numberOf(raw && raw.settings && raw.settings.speed, 45, 10, 160))
      },
      through: { up: sanitizeThrough(raw && raw.through && raw.through.up), down: sanitizeThrough(raw && raw.through && raw.through.down) },
      overrides: sanitizeOverrides(raw && raw.overrides, services, branches)
    };
  }

  function sanitizeState(candidate) {
    if (!candidate || !Array.isArray(candidate.lines) || !candidate.lines.length) throw new Error('路線データが見つかりません。');
    const lines = candidate.lines.slice(0, 30).map(sanitizeLine);
    const lineIds = new Set(lines.map((route) => route.id));
    lines.forEach((route) => {
      const stationIds = new Set(route.stations.map((station) => station.id));
      route.branches.forEach((branch) => {
        if (!stationIds.has(branch.junctionStationId)) branch.junctionStationId = route.stations[Math.floor(route.stations.length / 2)].id;
        const target = lines.find((item) => item.id === branch.targetLineId);
        if (!target || target.id === route.id) {
          branch.enabled = false; branch.targetLineId = ''; branch.targetServiceId = ''; return;
        }
        if (!target.services.some((service) => service.id === branch.targetServiceId)) branch.targetServiceId = target.services[0].id;
      });
      ['up', 'down'].forEach((dir) => {
        const through = route.through[dir];
        const target = lines.find((item) => item.id === through.legacyTargetLineId && item.id !== route.id);
        if (target) {
          if (!through.lineName) through.lineName = target.name;
          if (!through.directionLabel) through.directionLabel = through.legacyTargetDirection === 'down' ? target.downLabel : target.upLabel;
          if (!through.serviceName) {
            const targetService = target.services.find((service) => service.id === through.legacyTargetServiceId) || target.services[0];
            through.serviceName = targetService.name;
          }
          if (!through.destination) {
            const targetSequence = routeSequence(target, through.legacyTargetDirection);
            through.destination = targetSequence[targetSequence.length - 1].name;
          }
        }
        delete through.legacyTargetLineId; delete through.legacyTargetDirection; delete through.legacyTargetServiceId;
      });
    });
    return { version: APP_VERSION, selectedId: lineIds.has(candidate.selectedId) ? candidate.selectedId : lines[0].id, lines };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? sanitizeState(JSON.parse(raw)) : defaultState();
    } catch (_) { return defaultState(); }
  }

  let state = loadState();
  let activePage = 'lines';
  let direction = 'up';
  let period = 'morning';
  let toastTimer = null;
  const line = () => state.lines.find((item) => item.id === state.selectedId) || state.lines[0];
  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (_) { showToast('保存容量が不足しています'); }
  };

  function showToast(message) {
    const element = $('#toast'); element.textContent = message; element.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('show'), 2200);
  }

  const parseTime = (value) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value));
    return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
  };
  const formatTime = (minutes, showDay = true) => {
    const safe = Math.max(0, Math.round(minutes));
    const day = Math.floor(safe / 1440); const clock = safe % 1440;
    const value = `${padNumber(Math.floor(clock / 60), 2)}:${padNumber(clock % 60, 2)}`;
    return showDay && day > 0 ? `翌 ${value}` : value;
  };
  const timeInputValue = (minutes) => formatTime(minutes, false);
  function parseEditorTime(value, reference) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
    const clock = Number(match[1]) * 60 + Number(match[2]);
    const baseDay = Math.floor(Math.max(0, Number(reference) || 0) / 1440) * 1440;
    return [baseDay - 1440 + clock, baseDay + clock, baseDay + 1440 + clock]
      .filter((candidate) => candidate >= 0)
      .sort((a, b) => Math.abs(a - reference) - Math.abs(b - reference))[0];
  }
  const routeDistance = (route) => route.stations.reduce((total, station, index) => total + (index ? Number(station.km) || 0 : 0), 0);

  function routeSequence(route, dir) {
    const stations = dir === 'up' ? [...route.stations] : [...route.stations].reverse();
    return stations.map((station) => ({
      ...station, lineId: route.id, lineName: route.name, lineCode: route.code, lineColor: route.color,
      stationIndex: route.stations.findIndex((item) => item.id === station.id)
    }));
  }
  const stationTimeKey = (station) => station.timeKey || station.id;
  const sourceStationId = (station) => station.originalStationId || station.id;
  function stationStops(station, position, length, service) {
    return position === 0 || position === length - 1 || service.allStops || station.stops.indexOf(service.id) >= 0;
  }
  function trainStops(station, position, length, service, stopOverrides) {
    const automatic = stationStops(station, position, length, service);
    if (position === 0 || position === length - 1) return { stop: true, automatic, locked: true };
    const key = stationTimeKey(station);
    return { stop: hasOwn(stopOverrides, key) ? stopOverrides[key] : automatic, automatic, locked: false };
  }
  function startSegment(sequence, clock, times, stopTimes) {
    if (!sequence.length) return;
    const key = stationTimeKey(sequence[0]);
    times[key] = clock;
    stopTimes[key] = { arrival: clock, departure: clock, stop: true, automatic: true, locked: true };
  }
  function runSegment(route, sequence, service, startClock, times, stopTimes, stopOverrides) {
    const originalIndex = new Map(route.stations.map((station, index) => [station.id, index]));
    let clock = startClock;
    for (let position = 1; position < sequence.length; position += 1) {
      const previous = sequence[position - 1]; const current = sequence[position];
      const previousDetail = stopTimes[stationTimeKey(previous)];
      if (previousDetail) clock = previousDetail.departure;
      const a = originalIndex.get(sourceStationId(previous)); const b = originalIndex.get(sourceStationId(current));
      const segmentStation = route.stations[Math.max(a, b)];
      const km = numberOf(segmentStation && segmentStation.km, 1, .1, 99.9);
      const speed = numberOf(route.settings.speed, 45, 10, 160);
      clock += Math.max(1, Math.round((km / speed) * 60 + .7));
      const stopState = trainStops(current, position, sequence.length, service, stopOverrides);
      const key = stationTimeKey(current);
      const dwell = stopState.stop && position < sequence.length - 1 ? Math.ceil(numberOf(current.dwell, 40, 0, 600) / 60) : 0;
      stopTimes[key] = { arrival: clock, departure: clock + dwell, stop: stopState.stop, automatic: stopState.automatic, locked: stopState.locked };
      times[key] = stopState.stop ? clock : null;
    }
    return clock;
  }
  function chooseService(route, trainNumber, override) {
    if (override && override.serviceId) {
      const selected = route.services.find((service) => service.id === override.serviceId);
      if (selected) return selected;
    }
    return route.services.slice(1).find((service) => service.every >= 2 && trainNumber % service.every === 0) || route.services[0];
  }
  function throughContext(route, dir) {
    const config = route.through[dir];
    if (!config || !config.enabled) return null;
    return { config };
  }
  function branchContext(route, branch, dir, contextState, baseSequence = routeSequence(route, dir)) {
    if (!branch || !branch.enabled) return null;
    const target = contextState.lines.find((item) => item.id === branch.targetLineId && item.id !== route.id);
    const junctionIndex = baseSequence.findIndex((station) => station.id === branch.junctionStationId);
    if (!target || junctionIndex < 0) return null;
    const outward = dir === branch.outboundDirection;
    const targetDirection = outward ? branch.targetDirection : (branch.targetDirection === 'up' ? 'down' : 'up');
    const targetService = target.services.find((service) => service.id === branch.targetServiceId) || target.services[0];
    const sequence = routeSequence(target, targetDirection).map((station) => ({
      ...station,
      originalStationId: station.id,
      timeKey: `branch:${branch.id}:${station.id}`,
      connectionType: 'branch',
      connectionName: branch.name || target.name,
      branchId: branch.id
    }));
    return { config: branch, target, targetService, sequence, junctionIndex, outward };
  }
  function branchContexts(route, dir, contextState = state, baseSequence = routeSequence(route, dir)) {
    return (route.branches || []).map((branch) => branchContext(route, branch, dir, contextState, baseSequence)).filter(Boolean);
  }
  function buildTrips(route, dir, contextState = state) {
    const first = parseTime(route.settings.first); let last = parseTime(route.settings.last);
    if (last <= first) last += 1440;
    const headway = numberOf(route.settings.headway, 15, 2, 180);
    const baseSequence = routeSequence(route, dir);
    const branches = branchContexts(route, dir, contextState, baseSequence);
    const direct = throughContext(route, dir, contextState);
    const displaySequence = baseSequence.concat(...branches.map((branch) => branch.sequence));
    const trips = [];
    for (let scheduledDeparture = first, tripIndex = 0; scheduledDeparture <= last && tripIndex < 400; scheduledDeparture += headway, tripIndex += 1) {
      const trainNumber = tripIndex + 1;
      const trainId = `${route.code}${padNumber(trainNumber, 3)}${dir === 'up' ? 'A' : 'B'}`;
      const override = route.overrides[dir][trainId] || {};
      const service = chooseService(route, trainNumber, override);
      const editedDeparture = safeMinute(override.departure);
      const departure = editedDeparture === null ? scheduledDeparture : editedDeparture;
      const stopOverrides = override.stationStops || {};
      let branch = null;
      if (override.branchId && override.branchId !== 'none') branch = branches.find((item) => item.config.id === override.branchId) || null;
      else if (override.branchId !== 'none' && override.through !== true) branch = branches.find((item) => trainNumber % item.config.every === 0) || null;
      const automaticThrough = Boolean(!branch && direct && trainNumber % direct.config.every === 0);
      const isThrough = Boolean(!branch && direct && (override.through === true || (override.through !== false && automaticThrough)));
      const times = {}; const stopTimes = {}; let clock = departure; let stationSequence = [];
      let destination = (dir === 'up' ? route.upDestination : route.downDestination) || baseSequence[baseSequence.length - 1].name;
      if (branch && branch.outward) {
        const mainSegment = baseSequence.slice(0, branch.junctionIndex + 1);
        stationSequence = mainSegment.concat(branch.sequence);
        startSegment(mainSegment, clock, times, stopTimes);
        clock = runSegment(route, mainSegment, service, clock, times, stopTimes, stopOverrides);
        clock += branch.config.layover;
        const junctionDetail = stopTimes[stationTimeKey(mainSegment[mainSegment.length - 1])];
        if (junctionDetail) junctionDetail.departure = clock;
        startSegment(branch.sequence, clock, times, stopTimes);
        clock = runSegment(branch.target, branch.sequence, branch.targetService, clock, times, stopTimes, stopOverrides);
        destination = branch.config.destination || branch.sequence[branch.sequence.length - 1].name;
      } else if (branch) {
        const mainSegment = baseSequence.slice(branch.junctionIndex);
        stationSequence = branch.sequence.concat(mainSegment);
        startSegment(branch.sequence, clock, times, stopTimes);
        clock = runSegment(branch.target, branch.sequence, branch.targetService, clock, times, stopTimes, stopOverrides);
        clock += branch.config.layover;
        const branchJunctionDetail = stopTimes[stationTimeKey(branch.sequence[branch.sequence.length - 1])];
        if (branchJunctionDetail) branchJunctionDetail.departure = clock;
        startSegment(mainSegment, clock, times, stopTimes);
        clock = runSegment(route, mainSegment, service, clock, times, stopTimes, stopOverrides);
      } else {
        stationSequence = baseSequence;
        startSegment(baseSequence, clock, times, stopTimes);
        clock = runSegment(route, baseSequence, service, clock, times, stopTimes, stopOverrides);
        if (isThrough) {
          clock += direct.config.layover;
          destination = direct.config.destination || destination;
        }
      }
      const editedStationTimes = override.stationTimes || {};
      Object.keys(editedStationTimes).forEach((key) => {
        const detail = stopTimes[key]; if (!detail) return;
        const arrival = safeMinute(editedStationTimes[key].arrival);
        const stationDeparture = safeMinute(editedStationTimes[key].departure);
        if (arrival !== null) detail.arrival = arrival;
        if (stationDeparture !== null) detail.departure = stationDeparture;
      });
      stationSequence.forEach((station, index) => {
        const key = stationTimeKey(station); const detail = stopTimes[key];
        if (detail) times[key] = detail.stop ? (index === 0 ? detail.departure : detail.arrival) : null;
      });
      if (override.destination) destination = override.destination;
      trips.push({ id: trainId, serviceId: service.id, kind: service.name, short: service.short,
        serviceColor: service.color, scheduledDeparture, departure,
        arrival: stopTimes[stationTimeKey(stationSequence[stationSequence.length - 1])]
          ? stopTimes[stationTimeKey(stationSequence[stationSequence.length - 1])].arrival : clock,
        platform: cleanPlatform(override.platform) || (dir === 'up' ? '1' : '2'), destination, through: isThrough,
        throughLineName: isThrough ? direct.config.lineName : '',
        throughDirectionLabel: isThrough ? direct.config.directionLabel : '',
        throughServiceName: isThrough ? direct.config.serviceName : '',
        branchId: branch ? branch.config.id : '', branchName: branch ? branch.config.name : '',
        stationSequence, stopTimes, times });
    }
    return { sequence: displaySequence, baseSequence, trips };
  }
  const scheduleFor = (route, contextState = state) => ({ up: buildTrips(route, 'up', contextState), down: buildTrips(route, 'down', contextState) });

  function renderLineTabs() {
    $('#lineTabs').innerHTML = state.lines.map((item) => `<button class="line-tab ${item.id === state.selectedId ? 'active' : ''}" data-select-line="${esc(item.id)}"><i class="line-dot" style="background:${colorOf(item.color)}"></i>${esc(item.name)}</button>`).join('');
  }
  function renderLineEditor() {
    const route = line(); const distance = routeDistance(route); const preview = buildTrips(route, 'up').trips[0];
    const journey = preview ? preview.arrival - preview.departure : 0; const routeColor = colorOf(route.color);
    $('#lineEditor').innerHTML = `<div class="route-editor-layout">
      <article class="route-hero" id="routeHero" style="background:${routeColor}"><span class="route-badge" id="heroCode">${esc(route.code)}</span><h2 id="heroName">${esc(route.name)}</h2><p id="heroOperator">${esc(route.operator)}</p><div class="route-facts"><div><span>STATIONS</span><b>${route.stations.length}駅</b></div><div><span>DISTANCE</span><b>${distance.toFixed(1)} km</b></div><div><span>LOCAL TIME</span><b>約${journey}分</b></div></div></article>
      <article class="card"><div class="card-title"><h2>路線プロフィール</h2><span>自動保存</span></div><div class="form-grid">
        <label class="field full"><span>鉄道事業者</span><input data-line-field="operator" maxlength="40" value="${esc(route.operator)}"></label>
        <label class="field"><span>路線名</span><input data-line-field="name" maxlength="40" value="${esc(route.name)}"></label>
        <label class="field"><span>路線記号</span><input data-line-field="code" maxlength="4" value="${esc(route.code)}" inputmode="latin"></label>
        <label class="field"><span>ラインカラー</span><input data-line-field="color" type="color" value="${routeColor}"></label>
        <label class="field"><span>上り方向名</span><input data-line-field="upLabel" maxlength="40" value="${esc(route.upLabel)}"></label>
        <label class="field"><span>上り基本行先</span><input data-line-field="upDestination" maxlength="40" value="${esc(route.upDestination)}"></label>
        <label class="field"><span>下り方向名</span><input data-line-field="downLabel" maxlength="40" value="${esc(route.downLabel)}"></label>
        <label class="field"><span>下り基本行先</span><input data-line-field="downDestination" maxlength="40" value="${esc(route.downDestination)}"></label>
      </div><div class="action-row"><button class="secondary" data-action="duplicate-line">路線を複製</button><button class="danger-button" data-action="delete-line">路線を削除</button></div></article></div>`;
  }
  function stopPatternHtml(route, station, stationIndex) {
    const selective = route.services.filter((service) => !service.allStops);
    if (!selective.length) return '<span class="all-stop-note">全種別が停車</span>';
    const endpoint = stationIndex === 0 || stationIndex === route.stations.length - 1;
    return selective.map((service) => {
      const checked = endpoint || station.stops.indexOf(service.id) >= 0;
      return `<label class="stop-chip" style="--service-color:${colorOf(service.color, '#41506e')}"><input type="checkbox" data-stop-service="${esc(service.id)}" data-index="${stationIndex}" ${checked ? 'checked' : ''} ${endpoint ? 'disabled' : ''}><span><i></i>${esc(service.short)} ${esc(service.name)}</span></label>`;
    }).join('');
  }
  function renderStations() {
    const route = line(); const routeColor = colorOf(route.color);
    $('#stationList').innerHTML = route.stations.map((station, index) => `<article class="station-item" style="--route-color:${routeColor}"><div class="station-track"><span class="station-number">${esc(route.code)}${padNumber(index + 1, 2)}</span></div><div class="station-card"><div class="station-top"><input class="station-name" aria-label="駅名" data-station-field="name" data-index="${index}" maxlength="40" value="${esc(station.name)}"><div class="station-buttons"><button aria-label="上へ移動" data-move-station="up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button><button aria-label="下へ移動" data-move-station="down" data-index="${index}" ${index === route.stations.length - 1 ? 'disabled' : ''}>↓</button><button aria-label="駅を削除" data-remove-station="${index}">×</button></div></div><div class="station-meta compact"><label class="field suffix-field"><span>前駅から</span><input type="number" min="0.1" max="99.9" step="0.1" data-station-field="km" data-index="${index}" value="${station.km}" ${index === 0 ? 'disabled' : ''}><em>km</em></label><label class="field suffix-field"><span>停車時間</span><input type="number" min="0" max="600" step="5" data-station-field="dwell" data-index="${index}" value="${station.dwell}"><em>秒</em></label></div><div class="stop-patterns"><small>停車する選択停車種別</small><div>${stopPatternHtml(route, station, index)}</div></div></div></article>`).join('');
  }
  function generationStats(route) {
    const up = buildTrips(route, 'up'); const down = buildTrips(route, 'down'); const all = up.trips.concat(down.trips); const firstTrip = up.trips[0];
    return {
      trains: all.length,
      journey: firstTrip ? firstTrip.arrival - firstTrip.departure : 0,
      branchCount: all.filter((trip) => trip.branchId).length,
      throughCount: all.filter((trip) => trip.through).length
    };
  }
  function serviceEditors(route) {
    return route.services.map((service, index) => `<div class="service-row" style="--service-color:${colorOf(service.color, '#41506e')}"><i class="service-swatch"></i><div class="service-fields"><label class="field"><span>種別名</span><input maxlength="20" data-service-id="${esc(service.id)}" data-service-field="name" value="${esc(service.name)}"></label><label class="field short-field"><span>略称</span><input maxlength="3" data-service-id="${esc(service.id)}" data-service-field="short" value="${esc(service.short)}"></label><label class="field color-field"><span>色</span><input type="color" data-service-id="${esc(service.id)}" data-service-field="color" value="${colorOf(service.color, '#41506e')}"></label><label class="field frequency-field suffix-field"><span>${index === 0 ? '基準種別' : '運転頻度'}</span><input type="number" min="${index === 0 ? 1 : 0}" max="20" data-service-id="${esc(service.id)}" data-service-field="every" value="${service.every}" ${index === 0 ? 'disabled' : ''}><em>${index === 0 ? '毎本' : '本毎'}</em></label></div><div class="service-actions"><label class="inline-check"><input type="checkbox" data-service-id="${esc(service.id)}" data-service-field="allStops" ${service.allStops ? 'checked' : ''} ${index === 0 ? 'disabled' : ''}> 全駅停車</label>${index === 0 ? '<span class="base-tag">基本</span>' : `<button class="remove-mini" data-remove-service="${esc(service.id)}">削除</button>`}</div></div>`).join('');
  }
  function directionOption(route, dir) {
    const sequence = routeSequence(route, dir); return `${sequence[0].name} → ${sequence[sequence.length - 1].name}`;
  }
  function throughEditor(route, dir) {
    const config = route.through[dir]; const disabled = config.enabled ? '' : 'disabled';
    return `<div class="through-card ${config.enabled ? 'enabled' : ''}"><div class="through-title"><div><b>${dir === 'up' ? '上り' : '下り'}直通</b><span>路線作成不要・自由入力</span></div><label class="switch"><input type="checkbox" data-through-dir="${dir}" data-through-field="enabled" ${config.enabled ? 'checked' : ''}><i></i></label></div><div class="form-grid through-fields"><label class="field full"><span>直通先路線名</span><input maxlength="40" data-through-dir="${dir}" data-through-field="lineName" value="${esc(config.lineName)}" placeholder="例：海浜線" ${disabled}></label><label class="field full"><span>直通先の方面・方向</span><input maxlength="40" data-through-dir="${dir}" data-through-field="directionLabel" value="${esc(config.directionLabel)}" placeholder="例：潮見方面" ${disabled}></label><label class="field suffix-field"><span>直通頻度</span><input type="number" min="1" max="20" data-through-dir="${dir}" data-through-field="every" value="${config.every}" ${disabled}><em>本毎</em></label><label class="field suffix-field"><span>接続停車</span><input type="number" min="0" max="60" data-through-dir="${dir}" data-through-field="layover" value="${config.layover}" ${disabled}><em>分</em></label><label class="field full"><span>直通先での種別</span><input maxlength="20" data-through-dir="${dir}" data-through-field="serviceName" value="${esc(config.serviceName)}" placeholder="例：普通・快速" ${disabled}></label><label class="field full"><span>直通列車の行先</span><input maxlength="40" data-through-dir="${dir}" data-through-field="destination" value="${esc(config.destination)}" placeholder="例：潮見" ${disabled}></label></div></div>`;
  }
  function branchEditor(route, branch) {
    const others = state.lines.filter((item) => item.id !== route.id);
    const target = others.find((item) => item.id === branch.targetLineId) || others[0];
    const targetServices = target ? target.services : [];
    const junction = route.stations.find((station) => station.id === branch.junctionStationId) || route.stations[0];
    const autoDestination = target ? routeSequence(target, branch.targetDirection).slice(-1)[0].name : '';
    const disabled = branch.enabled ? '' : 'disabled';
    return `<div class="branch-card ${branch.enabled ? 'enabled' : ''}"><div class="branch-title"><div><b>${esc(branch.name || '名称未設定の支線')}</b><span>${esc(junction.name)}から分岐</span></div><div class="branch-actions"><label class="switch"><input type="checkbox" data-branch-id="${esc(branch.id)}" data-branch-field="enabled" ${branch.enabled ? 'checked' : ''}><i></i></label><button class="remove-mini" data-remove-branch="${esc(branch.id)}">削除</button></div></div><div class="form-grid branch-fields"><label class="field full"><span>支線設定名</span><input maxlength="40" data-branch-id="${esc(branch.id)}" data-branch-field="name" value="${esc(branch.name)}" ${disabled}></label><label class="field"><span>本線の分岐駅</span><select data-branch-id="${esc(branch.id)}" data-branch-field="junctionStationId" ${disabled}>${route.stations.map((station) => `<option value="${esc(station.id)}" ${station.id === branch.junctionStationId ? 'selected' : ''}>${esc(station.name)}</option>`).join('')}</select></label><label class="field"><span>支線に使う路線</span><select data-branch-id="${esc(branch.id)}" data-branch-field="targetLineId" ${disabled}>${others.map((item) => `<option value="${esc(item.id)}" ${item.id === (target && target.id) ? 'selected' : ''}>${esc(item.operator)} ${esc(item.name)}</option>`).join('')}</select></label><label class="field full"><span>本線から支線へ向かう方向</span><select data-branch-id="${esc(branch.id)}" data-branch-field="outboundDirection" ${disabled}><option value="up" ${branch.outboundDirection === 'up' ? 'selected' : ''}>${esc(route.upLabel)}（${esc(directionOption(route, 'up'))}）</option><option value="down" ${branch.outboundDirection === 'down' ? 'selected' : ''}>${esc(route.downLabel)}（${esc(directionOption(route, 'down'))}）</option></select></label><label class="field full"><span>支線内の運転方向</span><select data-branch-id="${esc(branch.id)}" data-branch-field="targetDirection" ${disabled}><option value="up" ${branch.targetDirection === 'up' ? 'selected' : ''}>${target ? esc(directionOption(target, 'up')) : '起点 → 終点'}</option><option value="down" ${branch.targetDirection === 'down' ? 'selected' : ''}>${target ? esc(directionOption(target, 'down')) : '終点 → 起点'}</option></select></label><label class="field suffix-field"><span>支線運転頻度</span><input type="number" min="1" max="20" data-branch-id="${esc(branch.id)}" data-branch-field="every" value="${branch.every}" ${disabled}><em>本毎</em></label><label class="field suffix-field"><span>分岐駅停車</span><input type="number" min="0" max="60" data-branch-id="${esc(branch.id)}" data-branch-field="layover" value="${branch.layover}" ${disabled}><em>分</em></label><label class="field full"><span>支線内の列車種別</span><select data-branch-id="${esc(branch.id)}" data-branch-field="targetServiceId" ${disabled}>${targetServices.map((service) => `<option value="${esc(service.id)}" ${service.id === branch.targetServiceId ? 'selected' : ''}>${esc(service.name)}</option>`).join('')}</select></label><label class="field full"><span>支線方面の行先</span><input maxlength="40" data-branch-id="${esc(branch.id)}" data-branch-field="destination" value="${esc(branch.destination)}" placeholder="自動：${esc(autoDestination)}" ${disabled}></label></div></div>`;
  }
  function branchEditors(route) {
    if (!route.branches.length) return '<p class="branch-empty">「＋ 支線追加」から、別路線を本線の分岐駅へ接続できます。</p>';
    return route.branches.map((branch) => branchEditor(route, branch)).join('');
  }
  function renderGenerator() {
    const route = line(); const settings = route.settings; const stats = generationStats(route);
    $('#generatorEditor').innerHTML = `<article class="generation-hero"><span class="eyebrow">${esc(route.code)} · ${esc(route.operator)}</span><h2>${esc(route.name)} 運行計画</h2><p>列車種別・停車駅・支線・直通先を組み合わせ、上下線の運行を自動配置します。</p></article>
      <article class="card"><div class="card-title"><h2>運転時間帯</h2><span>24時をまたぐ設定可</span></div><div class="form-grid"><label class="field"><span>始発</span><input type="time" data-setting="first" value="${esc(settings.first)}"></label><label class="field"><span>終発</span><input type="time" data-setting="last" value="${esc(settings.last)}"></label><label class="field suffix-field"><span>運転間隔</span><input type="number" min="2" max="180" data-setting="headway" value="${settings.headway}"><em>分</em></label><label class="field suffix-field"><span>表定速度</span><input type="number" min="10" max="160" data-setting="speed" value="${settings.speed}"><em>km/h</em></label></div></article>
      <article class="card service-editor-card"><div class="card-title"><div><h2>列車種別</h2><span>0本毎は列車別設定専用</span></div><button class="secondary small" data-action="add-service">＋ 種別追加</button></div><div class="service-list">${serviceEditors(route)}</div></article>
      <article class="card branch-editor-card"><div class="card-title"><div><h2>支線運転</h2><span>設定順が同一列車では優先</span></div><button class="secondary small" data-action="add-branch" ${state.lines.length < 2 ? 'disabled' : ''}>＋ 支線追加</button></div><div class="branch-list">${branchEditors(route)}</div></article>
      <article class="card"><div class="card-title"><h2>他路線への直通運転</h2><span>路線名・行先を自由入力</span></div><div class="through-grid">${throughEditor(route, 'up')}${throughEditor(route, 'down')}</div></article>
      <div class="stats-grid" id="generationStats"><div class="stat"><b>${stats.trains}</b><span>上下 合計本数</span></div><div class="stat"><b>${stats.journey}</b><span>始発 所要分</span></div><div class="stat"><b>${stats.branchCount}</b><span>支線 本数</span></div><div class="stat"><b>${stats.throughCount}</b><span>直通 本数</span></div></div><button class="primary wide generate-button" data-action="generate">時刻表を生成する</button>`;
  }
  const isInPeriod = (trip, selectedPeriod) => {
    if (selectedPeriod === 'all') return true; const clock = trip.departure % 1440;
    if (selectedPeriod === 'morning') return clock >= 240 && clock < 600;
    if (selectedPeriod === 'day') return clock >= 600 && clock < 960;
    return clock >= 960 || clock < 240;
  };
  function renderTimetable() {
    const route = line(); const schedule = scheduleFor(route); const current = schedule[direction];
    const trips = current.trips.filter((trip) => isInPeriod(trip, period));
    const directionLabel = direction === 'up' ? route.upLabel : route.downLabel;
    $('#timetableControls').innerHTML = `<div class="segmented"><button class="${direction === 'up' ? 'active' : ''}" data-direction="up">上り</button><button class="${direction === 'down' ? 'active' : ''}" data-direction="down">下り</button></div><div class="segmented"><button class="${period === 'morning' ? 'active' : ''}" data-period="morning">朝 4–10</button><button class="${period === 'day' ? 'active' : ''}" data-period="day">昼 10–16</button><button class="${period === 'evening' ? 'active' : ''}" data-period="evening">夜 16–4</button><button class="${period === 'all' ? 'active' : ''}" data-period="all">全日</button></div><div class="direction-card" style="--route-color:${colorOf(route.color)}"><div><small>${esc(route.operator)} · ${esc(route.code)}</small><b>${esc(directionLabel)}</b></div><div class="direction-arrow"><span>${esc(current.baseSequence[0].name)}</span><i></i><span>${esc(current.baseSequence[current.baseSequence.length - 1].name)}</span></div></div><p class="table-tip">列車をタップすると、行先・種別・番線・発車時刻・各駅の着発時刻を編集できます。</p>`;
    if (!trips.length) { $('#timetable').innerHTML = `<div class="empty-state"><div class="empty-icon">◷</div><h3>この時間帯の列車はありません</h3><p>時間帯を変更するか、運行条件を調整してください。</p><button class="secondary" data-action="go-generate">運行条件へ</button></div>`; return; }
    const header = trips.map((trip) => `<th><button class="train-edit" data-edit-train="${esc(trip.id)}" style="--service-color:${colorOf(trip.serviceColor, '#41506e')}"><span class="train-name"><i>${esc(trip.short)}</i> ${esc(trip.id)}</span><span class="train-destination">${trip.branchId ? '分 ' : (trip.through ? `↗ ${trip.throughLineName ? `${esc(trip.throughLineName)}・` : ''}` : '')}${esc(trip.destination)}ゆき</span><span class="train-platform">${esc(platformLabel(trip.platform))}</span><span class="train-time">${formatTime(trip.departure, false)}</span></button></th>`).join('');
    const rows = current.sequence.map((station, index) => {
      const previous = current.sequence[index - 1];
      const boundary = Boolean(previous && station.connectionType && (previous.lineId !== station.lineId || previous.branchId !== station.branchId || previous.connectionType !== station.connectionType));
      const cells = trips.map((trip) => { const time = trip.times[stationTimeKey(station)]; if (typeof time === 'undefined') return '<td class="not-running">—</td>'; return time === null ? '<td class="pass">│</td>' : `<td>${formatTime(time, false)}</td>`; }).join('');
      const connectionLabel = station.connectionType === 'branch' ? `支線・${station.connectionName}` : `直通・${station.connectionName || station.lineName}`;
      return `<tr class="${boundary ? 'through-boundary' : ''}"><td>${boundary ? `<small class="line-label">${esc(connectionLabel)}</small>` : ''}<span class="station-code" style="background:${colorOf(station.lineColor)}">${esc(station.lineCode)}${padNumber(station.stationIndex + 1, 2)}</span>${esc(station.name)}</td>${cells}</tr>`;
    }).join('');
    $('#timetable').innerHTML = `<div class="table-wrap"><table class="dia-table"><thead><tr><th>駅 / 列車</th>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderPage(name) { if (name === 'lines') { renderLineTabs(); renderLineEditor(); } if (name === 'stations') renderStations(); if (name === 'generate') renderGenerator(); if (name === 'timetable') renderTimetable(); }
  function navigate(name, scroll = true) { activePage = name; $$('.page').forEach((page) => page.classList.toggle('active', page.dataset.page === name)); $$('.bottom-nav button').forEach((button) => button.classList.toggle('active', button.dataset.nav === name)); renderPage(name); if (scroll) window.scrollTo(0, 0); }
  function patchLinePreview(field, value) { if (field === 'name' && $('#heroName')) $('#heroName').textContent = value || '名称未設定'; if (field === 'operator' && $('#heroOperator')) $('#heroOperator').textContent = value || '事業者未設定'; if (field === 'code' && $('#heroCode')) $('#heroCode').textContent = value || 'FR'; if (field === 'color' && $('#routeHero')) $('#routeHero').style.background = colorOf(value); }
  function updateGenerationStats() { const container = $('#generationStats'); if (!container) return; const stats = generationStats(line()); container.innerHTML = `<div class="stat"><b>${stats.trains}</b><span>上下 合計本数</span></div><div class="stat"><b>${stats.journey}</b><span>始発 所要分</span></div><div class="stat"><b>${stats.branchCount}</b><span>支線 本数</span></div><div class="stat"><b>${stats.throughCount}</b><span>直通 本数</span></div>`; }
  function openModal(title, eyebrow, content) { $('#modalTitle').textContent = title; $('#modalEyebrow').textContent = eyebrow; $('#modalContent').innerHTML = content; $('#modalBackdrop').hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal() { $('#modalBackdrop').hidden = true; document.body.style.overflow = ''; }
  function openDataMenu() { openModal('データの入出力', 'DATA', `<div class="data-menu"><button class="data-action" data-modal-action="export-json"><b>路線データを書き出す</b><span>全路線・種別・支線・直通・番線・各駅時刻をJSONでコピー</span></button><button class="data-action" data-modal-action="import-json"><b>路線データを読み込む</b><span>JSONを貼り付けて現在のデータと置き換え</span></button><button class="data-action" data-modal-action="restore-demo"><b>サンプルからやり直す</b><span>直通設定済みの星河線・海浜線へ戻す</span></button></div><p class="modal-note">すべてのデータはこの端末内だけに保存され、外部へ送信されません。</p>`); }
  const csvCell = (value) => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
  function makeCsv() { const route = line(); const schedule = scheduleFor(route); const rows = [['基準路線', '方向', '列車番号', '種別', '行先', '発車番線', '支線', '直通', '直通路線', '直通先方面', '直通先種別', '走行路線', '駅順', '駅名', '時刻', '到着時刻', '発車時刻', '扱い']]; ['up', 'down'].forEach((dir) => { const directionName = dir === 'up' ? route.upLabel : route.downLabel; schedule[dir].trips.forEach((trip) => { schedule[dir].sequence.forEach((station, index) => { const key = stationTimeKey(station); const time = trip.times[key]; const detail = trip.stopTimes[key]; rows.push([route.name, directionName, trip.id, trip.kind, trip.destination, platformLabel(trip.platform), trip.branchName, trip.through ? '直通' : '', trip.throughLineName, trip.throughDirectionLabel, trip.throughServiceName, station.connectionName || station.lineName, index + 1, station.name, typeof time === 'number' ? formatTime(time) : '', detail && detail.stop ? formatTime(detail.arrival) : '', detail && detail.stop ? formatTime(detail.departure) : '', time === null ? '通過' : (typeof time === 'undefined' ? '運転なし' : '停車')]); }); }); }); return rows.map((row) => row.map(csvCell).join(',')).join('\r\n'); }
  function openTextOutput(title, eyebrow, text, note) { openModal(title, eyebrow, `<textarea id="dataTextarea" aria-label="書き出しデータ" spellcheck="false"></textarea><div class="modal-copy"><button class="primary" data-modal-action="copy-text">クリップボードへコピー</button><button class="secondary" data-modal-action="select-all">すべて選択</button></div><p class="modal-note">${esc(note)}</p>`); $('#dataTextarea').value = text; }
  async function copyTextarea() { const textarea = $('#dataTextarea'); if (!textarea) return; try { if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(textarea.value); else throw new Error('clipboard unavailable'); showToast('クリップボードへコピーしました'); } catch (_) { textarea.focus(); textarea.select(); showToast(document.execCommand('copy') ? 'クリップボードへコピーしました' : '選択した内容をコピーしてください'); } }

  function createLine() { const newRoute = blankLine(state.lines.length + 1); state.lines.push(newRoute); state.selectedId = newRoute.id; save(); navigate('lines'); showToast('新しい架空路線を作成しました'); }
  function duplicateLine() {
    const source = line(); const copy = clone(source); copy.id = makeId('line'); copy.name = `${copy.name} 複製`;
    const serviceMap = {}; copy.services.forEach((service) => { const old = service.id; service.id = makeId('svc'); serviceMap[old] = service.id; });
    const stationMap = {}; copy.stations.forEach((station) => { const old = station.id; station.id = makeId('st'); stationMap[old] = station.id; station.stops = station.stops.map((id) => serviceMap[id]).filter(Boolean); });
    copy.branches = (copy.branches || []).map((branch) => ({ ...branch, id: makeId('branch'), junctionStationId: stationMap[branch.junctionStationId] || copy.stations[0].id }));
    copy.overrides = { up: {}, down: {} };
    copy.branches.forEach((branch) => { if (branch.targetLineId === source.id) { branch.enabled = false; branch.targetLineId = ''; branch.targetServiceId = ''; } });
    state.lines.push(copy); state.selectedId = copy.id; save(); navigate('lines', false); showToast('路線を複製しました');
  }
  function askDeleteLine() { openModal('この路線を削除しますか？', 'CONFIRM', `<p class="modal-note">「${esc(line().name)}」の駅・種別・支線・直通・列車別設定も削除されます。</p><div class="action-row"><button class="secondary" data-modal-action="cancel">キャンセル</button><button class="danger-button" data-modal-action="confirm-delete-line">削除する</button></div>`); }
  function deleteLine() { const deletedId = state.selectedId; const index = state.lines.findIndex((item) => item.id === deletedId); state.lines.splice(index, 1); if (!state.lines.length) state.lines.push(blankLine(1)); state.lines.forEach((route) => { route.branches.forEach((branch) => { if (branch.targetLineId === deletedId) { branch.enabled = false; branch.targetLineId = ''; branch.targetServiceId = ''; } }); }); const next = state.lines[Math.max(0, index - 1)]; state.selectedId = (next && next.id) || state.lines[0].id; save(); closeModal(); navigate('lines', false); showToast('路線を削除しました'); }
  function addStation() { const route = line(); route.stations.push({ id: makeId('st'), name: `新駅 ${route.stations.length + 1}`, km: 1.5, dwell: 40, stops: [] }); save(); renderStations(); setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 50); }
  function removeStation(index) { const route = line(); const stations = route.stations; if (stations.length <= 2) { showToast('路線には2駅以上必要です'); return; } const removed = stations[index]; stations.splice(index, 1); stations[0].km = 0; route.branches.forEach((branch) => { if (branch.junctionStationId === removed.id) branch.junctionStationId = stations[Math.min(index, stations.length - 1)].id; }); save(); renderStations(); showToast('駅を削除しました'); }
  function moveStation(index, movement) { const stations = line().stations; const target = movement === 'up' ? index - 1 : index + 1; if (target < 0 || target >= stations.length) return; [stations[index], stations[target]] = [stations[target], stations[index]]; stations[0].km = 0; if (target === 0 || index === 0) stations[1].km = Math.max(.1, numberOf(stations[1].km, 1, .1, 99.9)); save(); renderStations(); }
  function addService() { const route = line(); if (route.services.length >= 12) { showToast('種別は12種類までです'); return; } route.services.push(newService(`新種別 ${route.services.length + 1}`, '新', '#8a55c7', 0, false)); save(); renderGenerator(); showToast('列車種別を追加しました'); }
  function removeService(serviceId) { const route = line(); const index = route.services.findIndex((service) => service.id === serviceId); if (index <= 0) return; route.services.splice(index, 1); route.stations.forEach((station) => { station.stops = station.stops.filter((id) => id !== serviceId); }); ['up', 'down'].forEach((dir) => Object.keys(route.overrides[dir]).forEach((id) => { if (route.overrides[dir][id].serviceId === serviceId) delete route.overrides[dir][id].serviceId; })); state.lines.forEach((other) => { other.branches.forEach((branch) => { if (branch.targetLineId === route.id && branch.targetServiceId === serviceId) branch.targetServiceId = route.services[0].id; }); }); save(); renderGenerator(); showToast('列車種別を削除しました'); }
  function addBranch() {
    const route = line(); const target = state.lines.find((item) => item.id !== route.id);
    if (!target) { showToast('支線に使う2つ目の路線を作成してください'); return; }
    if (route.branches.length >= 6) { showToast('支線は6本まで設定できます'); return; }
    route.branches.push(emptyBranch(route, target)); save(); renderGenerator(); showToast('支線設定を追加しました');
  }
  function removeBranch(branchId) {
    const route = line(); route.branches = route.branches.filter((branch) => branch.id !== branchId);
    ['up', 'down'].forEach((dir) => Object.keys(route.overrides[dir]).forEach((trainId) => {
      const override = route.overrides[dir][trainId];
      if (override.branchId === branchId) delete override.branchId;
      if (!Object.keys(override).length) delete route.overrides[dir][trainId];
    }));
    save(); renderGenerator(); showToast('支線設定を削除しました');
  }
  function trainStopEditorHtml(trip, override, routeColor) {
    const editedTimes = override.stationTimes || {};
    return trip.stationSequence.map((station, index) => {
      const key = stationTimeKey(station); const detail = trip.stopTimes[key]; if (!detail) return '';
      const custom = editedTimes[key] || {}; const first = index === 0;
      const arrivalValue = hasOwn(custom, 'arrival') ? timeInputValue(custom.arrival) : '';
      const departureValue = hasOwn(custom, 'departure') ? timeInputValue(custom.departure) : '';
      const routeName = station.connectionName || station.lineName;
      return `<div class="train-stop-row ${detail.stop ? '' : 'passing'}" data-stop-row="${esc(key)}" style="--stop-color:${colorOf(station.lineColor, routeColor)}">
        <div class="stop-time-display"><span><b>${formatTime(detail.arrival, false)}</b><small>${detail.stop ? '着' : '通過'}</small></span><span><b>${formatTime(detail.departure, false)}</b><small>${detail.stop ? '発' : '—'}</small></span></div>
        <i class="stop-line-node"></i>
        <div class="stop-detail-card"><div class="stop-detail-head"><div><small>${esc(routeName)}</small><b>${esc(station.name)}</b></div><select class="stop-mode-select" data-train-stop-key="${esc(key)}" data-auto-stop="${detail.automatic ? 'stop' : 'pass'}" ${detail.locked ? 'disabled' : ''}><option value="stop" ${detail.stop ? 'selected' : ''}>停車</option><option value="pass" ${detail.stop ? '' : 'selected'}>通過</option></select></div>
          <div class="stop-time-edit"><label><span>着時刻を変更</span><input type="time" step="60" data-train-time-key="${esc(key)}" data-train-time-field="arrival" data-time-reference="${detail.arrival}" value="${arrivalValue}" placeholder="${timeInputValue(detail.arrival)}" ${detail.stop ? '' : 'disabled'}></label>${first ? `<div class="origin-time-note"><span>発車時刻</span><b>上の欄で編集</b></div>` : `<label><span>発時刻を変更</span><input type="time" step="60" data-train-time-key="${esc(key)}" data-train-time-field="departure" data-time-reference="${detail.departure}" value="${departureValue}" placeholder="${timeInputValue(detail.departure)}" ${detail.stop ? '' : 'disabled'}></label>`}</div>
          <p>空欄は自動計算</p>
        </div>
      </div>`;
    }).join('');
  }
  function openTrainEditor(trainId) {
    const route = line(); const trip = buildTrips(route, direction).trips.find((item) => item.id === trainId); if (!trip) return;
    const override = route.overrides[direction][trainId] || {};
    const directAvailable = Boolean(throughContext(route, direction, state));
    const branches = branchContexts(route, direction, state);
    const throughValue = override.through === true ? 'yes' : (override.through === false ? 'no' : 'auto');
    const branchValue = override.branchId || 'auto';
    const operationNote = trip.branchId ? trip.branchName : (trip.through ? `${trip.throughLineName || '他路線'}へ直通` : (direction === 'up' ? route.upLabel : route.downLabel));
    const stopCount = Object.values(trip.stopTimes).filter((item) => item.stop).length;
    const routeColor = colorOf(route.color);
    openModal('列車詳細・編集', 'TRAIN INFO', `<input type="hidden" id="editTrainId" value="${esc(trainId)}"><input type="hidden" id="editTrainDirection" value="${direction}">
      <div class="train-detail-hero" style="--detail-color:${routeColor};--service-color:${colorOf(trip.serviceColor, '#41506e')}"><div class="train-detail-top"><div class="train-detail-clock"><b>${formatTime(trip.departure, false)}</b><span>発</span></div><span class="train-detail-platform">${esc(platformLabel(trip.platform))}</span></div><div class="train-detail-service"><i>${esc(trip.kind)}</i><div><b>${esc(trip.destination)} 行</b><small>${esc(operationNote)}・列車番号 ${esc(trip.id)}</small></div></div></div>
      <div class="form-grid train-detail-fields"><label class="field"><span>発車時刻</span><input type="time" step="60" id="editTrainDeparture" value="${timeInputValue(trip.departure)}"></label><label class="field suffix-field"><span>発車番線</span><input id="editTrainPlatform" maxlength="12" value="${esc(override.platform || '')}" placeholder="自動：${esc(trip.platform)}"><em>番線</em></label><label class="field full"><span>この列車の種別</span><select id="editTrainService"><option value="">自動設定：${esc(trip.kind)}</option>${route.services.map((service) => `<option value="${esc(service.id)}" ${override.serviceId === service.id ? 'selected' : ''}>${esc(service.name)}</option>`).join('')}</select></label><label class="field full"><span>この列車の行先</span><input id="editTrainDestination" maxlength="40" value="${esc(override.destination || '')}" placeholder="自動：${esc(trip.destination)}"></label>${branches.length ? `<label class="field full"><span>支線運転</span><select id="editTrainBranch"><option value="auto" ${branchValue === 'auto' ? 'selected' : ''}>自動設定</option><option value="none" ${branchValue === 'none' ? 'selected' : ''}>本線を運転</option>${branches.map((branch) => `<option value="${esc(branch.config.id)}" ${branchValue === branch.config.id ? 'selected' : ''}>${esc(branch.config.name)}を運転</option>`).join('')}</select></label>` : ''}${directAvailable ? `<label class="field full"><span>直通運転</span><select id="editTrainThrough"><option value="auto" ${throughValue === 'auto' ? 'selected' : ''}>自動設定</option><option value="yes" ${throughValue === 'yes' ? 'selected' : ''}>この列車は直通</option><option value="no" ${throughValue === 'no' ? 'selected' : ''}>この列車は直通しない</option></select></label>` : ''}</div>
      <section class="train-stop-editor"><div class="train-stop-title"><div><b>停車駅情報</b><span>停車・通過と着発時刻を列車ごとに編集</span></div><em>${stopCount}駅停車</em></div><div class="train-stop-list">${trainStopEditorHtml(trip, override, routeColor)}</div></section>
      <div class="action-row train-save-actions"><button class="secondary" data-modal-action="reset-train">全項目を自動へ戻す</button><button class="primary" data-modal-action="save-train">保存する</button></div>`);
  }
  function saveTrainOverride(reset) {
    const trainId = $('#editTrainId').value; const dir = $('#editTrainDirection').value; const route = line();
    if (reset) delete route.overrides[dir][trainId];
    else {
      const trip = buildTrips(route, dir).trips.find((entry) => entry.id === trainId); if (!trip) return;
      const item = {}; const serviceId = $('#editTrainService').value; const destination = $('#editTrainDestination').value.trim();
      const platform = cleanPlatform($('#editTrainPlatform').value); const departureRaw = $('#editTrainDeparture').value.trim();
      const departure = departureRaw ? parseEditorTime(departureRaw, trip.departure) : trip.scheduledDeparture;
      const branchSelect = $('#editTrainBranch'); const throughSelect = $('#editTrainThrough');
      if (departure === null) { showToast('発車時刻を確認してください'); return; }
      if (serviceId) item.serviceId = serviceId;
      if (destination) item.destination = destination.slice(0, 40);
      if (platform) item.platform = platform;
      if (departure !== trip.scheduledDeparture) item.departure = departure;
      if (branchSelect && branchSelect.value !== 'auto') item.branchId = branchSelect.value;
      if (throughSelect && throughSelect.value !== 'auto') item.through = throughSelect.value === 'yes';
      const stationStops = {}; const selectedStops = {};
      document.querySelectorAll('[data-train-stop-key]').forEach((select) => {
        const key = select.dataset.trainStopKey; const stopped = select.value === 'stop'; const automatic = select.dataset.autoStop === 'stop';
        selectedStops[key] = stopped; if (stopped !== automatic) stationStops[key] = stopped;
      });
      if (Object.keys(stationStops).length) item.stationStops = stationStops;
      const stationTimes = {}; let invalidTime = false;
      document.querySelectorAll('[data-train-time-key]').forEach((input) => {
        const raw = input.value.trim(); const key = input.dataset.trainTimeKey; if (!raw || selectedStops[key] === false) return;
        const parsed = parseEditorTime(raw, Number(input.dataset.timeReference));
        if (parsed === null) { invalidTime = true; return; }
        if (!stationTimes[key]) stationTimes[key] = {};
        stationTimes[key][input.dataset.trainTimeField] = parsed;
      });
      if (invalidTime) { showToast('各駅の時刻を確認してください'); return; }
      if (Object.keys(stationTimes).length) item.stationTimes = stationTimes;
      if (Object.keys(item).length) route.overrides[dir][trainId] = item; else delete route.overrides[dir][trainId];
    }
    save(); closeModal(); renderTimetable(); showToast(reset ? '列車を自動設定へ戻しました' : '列車設定を保存しました');
  }
  function updateThroughField(target) { const config = line().through[target.dataset.throughDir]; const field = target.dataset.throughField; if (!config || !field) return false; let value = target.type === 'checkbox' ? target.checked : target.value; if (field === 'every') value = Math.round(numberOf(value, 4, 1, 20)); if (field === 'layover') value = Math.round(numberOf(value, 3, 0, 60)); if (field === 'lineName' || field === 'directionLabel' || field === 'destination') value = value.slice(0, 40); if (field === 'serviceName') value = value.slice(0, 20); config[field] = value; save(); return field === 'enabled'; }
  function updateBranchField(target) {
    const route = line(); const branch = route.branches.find((item) => item.id === target.dataset.branchId); const field = target.dataset.branchField;
    if (!branch || !field) return false;
    let value = target.type === 'checkbox' ? target.checked : target.value;
    if (field === 'every') value = Math.round(numberOf(value, 4, 1, 20));
    if (field === 'layover') value = Math.round(numberOf(value, 2, 0, 60));
    if (field === 'name' || field === 'destination') value = value.slice(0, 40);
    branch[field] = value;
    if (field === 'enabled' && value && !branch.targetLineId) {
      const firstTarget = state.lines.find((item) => item.id !== route.id);
      if (firstTarget) { branch.targetLineId = firstTarget.id; branch.targetServiceId = firstTarget.services[0].id; }
    }
    if (field === 'targetLineId') {
      const targetLine = state.lines.find((item) => item.id === value);
      branch.targetServiceId = targetLine ? targetLine.services[0].id : ''; branch.destination = '';
    }
    save();
    return field === 'enabled' || field === 'targetLineId' || field === 'targetDirection' || field === 'outboundDirection' || field === 'junctionStationId';
  }

  $$('.bottom-nav button').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.nav)));
  $('#newLine').addEventListener('click', createLine); $('#addStation').addEventListener('click', addStation); $('#openData').addEventListener('click', openDataMenu); $('#closeModal').addEventListener('click', closeModal);
  $('#exportCsv').addEventListener('click', () => openTextOutput('時刻表 CSV', 'EXPORT', makeCsv(), '行先・種別・番線・着発時刻・支線・直通先を含む全列車データです。'));
  $('#modalBackdrop').addEventListener('click', (event) => { if (event.target === $('#modalBackdrop')) closeModal(); });

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.dataset.lineField) { const field = target.dataset.lineField; let value = target.value; if (field === 'code') { value = value.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase(); target.value = value; } if (field === 'color') value = colorOf(value); line()[field] = value; save(); patchLinePreview(field, value); if (field === 'name' || field === 'color') renderLineTabs(); return; }
    if (target.dataset.stationField) { const station = line().stations[Number(target.dataset.index)]; if (!station) return; const field = target.dataset.stationField; if (field === 'name') station.name = target.value.slice(0, 40); if (field === 'km' && target.value !== '') station.km = numberOf(target.value, 1, .1, 99.9); if (field === 'dwell' && target.value !== '') station.dwell = Math.round(numberOf(target.value, 40, 0, 600)); save(); return; }
    if (target.dataset.setting) { const field = target.dataset.setting; if (field === 'first' || field === 'last') line().settings[field] = target.value; else if (target.value !== '') line().settings[field] = Math.round(numberOf(target.value, line().settings[field], field === 'speed' ? 10 : 2, field === 'speed' ? 160 : 180)); save(); updateGenerationStats(); return; }
    if (target.dataset.serviceField && target.dataset.serviceField !== 'allStops') { const service = line().services.find((item) => item.id === target.dataset.serviceId); if (!service) return; const field = target.dataset.serviceField; if (field === 'name') service.name = target.value.slice(0, 20); if (field === 'short') service.short = target.value.slice(0, 3); if (field === 'color') service.color = colorOf(target.value, '#41506e'); if (field === 'every' && target.value !== '') service.every = Math.round(numberOf(target.value, 0, 0, 20)); save(); updateGenerationStats(); return; }
    if (target.dataset.branchField && target.type !== 'checkbox' && target.tagName !== 'SELECT') { updateBranchField(target); updateGenerationStats(); return; }
    if (target.dataset.throughField && target.type !== 'checkbox' && target.tagName !== 'SELECT') { updateThroughField(target); updateGenerationStats(); }
  });
  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target.dataset.trainStopKey) { const row = target.closest('[data-stop-row]'); if (row) { const passing = target.value === 'pass'; row.classList.toggle('passing', passing); row.querySelectorAll('[data-train-time-key]').forEach((input) => { input.disabled = passing; }); } return; }
    if (target.dataset.stopService) { const station = line().stations[Number(target.dataset.index)]; if (!station) return; station.stops = station.stops.filter((id) => id !== target.dataset.stopService); if (target.checked) station.stops.push(target.dataset.stopService); save(); return; }
    if (target.dataset.serviceField === 'allStops') { const service = line().services.find((item) => item.id === target.dataset.serviceId); if (service) { service.allStops = target.checked; save(); renderGenerator(); } return; }
    if (target.dataset.branchField) { const rerender = updateBranchField(target); if (rerender) renderGenerator(); else updateGenerationStats(); return; }
    if (target.dataset.throughField) { const rerender = updateThroughField(target); if (rerender) renderGenerator(); else updateGenerationStats(); }
  });
  document.addEventListener('click', (event) => {
    const selectLine = event.target.closest('[data-select-line]'); if (selectLine) { state.selectedId = selectLine.dataset.selectLine; save(); direction = 'up'; renderPage(activePage); return; }
    const move = event.target.closest('[data-move-station]'); if (move) { moveStation(Number(move.dataset.index), move.dataset.moveStation); return; }
    const remove = event.target.closest('[data-remove-station]'); if (remove) { removeStation(Number(remove.dataset.removeStation)); return; }
    const removeType = event.target.closest('[data-remove-service]'); if (removeType) { removeService(removeType.dataset.removeService); return; }
    const removeBranchButton = event.target.closest('[data-remove-branch]'); if (removeBranchButton) { removeBranch(removeBranchButton.dataset.removeBranch); return; }
    const editTrain = event.target.closest('[data-edit-train]'); if (editTrain) { openTrainEditor(editTrain.dataset.editTrain); return; }
    const dirButton = event.target.closest('[data-direction]'); if (dirButton) { direction = dirButton.dataset.direction; renderTimetable(); return; }
    const periodButton = event.target.closest('[data-period]'); if (periodButton) { period = periodButton.dataset.period; renderTimetable(); return; }
    const actionElement = event.target.closest('[data-action]'); const action = actionElement && actionElement.dataset.action;
    if (action === 'duplicate-line') duplicateLine(); if (action === 'delete-line') askDeleteLine(); if (action === 'add-service') addService(); if (action === 'add-branch') addBranch(); if (action === 'generate') { navigate('timetable'); showToast('番線・着発時刻付きの時刻表を生成しました'); } if (action === 'go-generate') navigate('generate');
    const modalActionElement = event.target.closest('[data-modal-action]'); const modalAction = modalActionElement && modalActionElement.dataset.modalAction;
    if (modalAction === 'cancel') closeModal(); if (modalAction === 'confirm-delete-line') deleteLine(); if (modalAction === 'save-train') saveTrainOverride(false); if (modalAction === 'reset-train') saveTrainOverride(true);
    if (modalAction === 'export-json') openTextOutput('路線データ JSON', 'EXPORT', JSON.stringify(state, null, 2), '全路線・種別・支線・直通・番線・各駅時刻を復元できます。');
    if (modalAction === 'import-json') openModal('路線データを読み込む', 'IMPORT', `<textarea id="dataTextarea" aria-label="読み込みデータ" spellcheck="false" placeholder="ここへJSONを貼り付け"></textarea><div class="action-row"><button class="secondary" data-modal-action="cancel">キャンセル</button><button class="primary" data-modal-action="apply-import">読み込む</button></div><p class="modal-note">現在の路線データは貼り付けた内容へ置き換わります。</p>`);
    if (modalAction === 'apply-import') { try { state = sanitizeState(JSON.parse($('#dataTextarea').value)); save(); closeModal(); navigate('lines'); showToast('路線データを読み込みました'); } catch (error) { showToast(error.message || 'JSONを確認してください'); } }
    if (modalAction === 'copy-text') copyTextarea(); if (modalAction === 'select-all') { const textarea = $('#dataTextarea'); if (textarea) { textarea.focus(); textarea.select(); } }
    if (modalAction === 'restore-demo') openModal('初期データへ戻しますか？', 'CONFIRM', `<p class="modal-note">現在の全路線を削除し、直通設定済みのサンプル2路線へ戻します。</p><div class="action-row"><button class="secondary" data-modal-action="cancel">キャンセル</button><button class="danger-button" data-modal-action="confirm-restore">戻す</button></div>`);
    if (modalAction === 'confirm-restore') { state = defaultState(); save(); closeModal(); navigate('lines'); showToast('サンプルデータへ戻しました'); }
  });

  renderLineTabs(); renderLineEditor();
})();
