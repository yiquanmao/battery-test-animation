const COLORS = {
  batFull: '#34c759', 
  batCharge: '#007aff', 
  batDis: '#ff9500', 
  batEmpty: '#d1d1d6'
};

const COUNT = 4;

const M1 = {
  phase: 'idle', 
  batteryLevels: [0.3,0.3,0.3,0.3],
  queue: [0,1,2,3], 
  done: [], 
  activeAtDevice: -1,
  _carryBatteryIdx: undefined, 
  _pickedBattery: -1, 
  isChargingPhase: true,
  personPos: { x: 60, y: 420 }, 
  personTarget: { x: 60, y: 420 }
};

const M2 = {
  phase: 'idle', 
  batteryLevels: [0.3,0.3,0.3,0.3],
  cablesConnected: [false,false,false,false],
  currentTargetBattery: 0, 
  energySource: 'device', 
  currentFlowType: 'charge',
  personPos: { x: 1200, y: 640 },
  personTarget: { x: 1200, y: 640 }
};

const m2BatteryYStart = 240;
const m2BatterySpacing = 35;

const startTime = performance.now();

function pad(n) { return String(n).padStart(2, '0'); }

function setClockHands(prefix, hours, minutes) {
  const h12 = hours % 12;
  const hourAngle = (h12 + minutes / 60) * 30;
  const minuteAngle = minutes * 6;
  document.getElementById(`${prefix}-clock-hour`).setAttribute('transform', `rotate(${hourAngle})`);
  document.getElementById(`${prefix}-clock-minute`).setAttribute('transform', `rotate(${minuteAngle})`);
}

const m1BatteryCount = COUNT;
const m1QueueBase = { x: 40, y: 500, spacing: 60 };
const m1DoneBase = { x: 420, y: 500, spacing: 60 };
const m1ActivePosition = { x: 540, y: 290 };
const m1PersonOffset = { x: 0, y: -10 };
const m1PersonHome = { x: 60, y: 420 };

function renderMethod1() {
  document.getElementById('m1-queue-label').textContent = `待充区 (${M1.queue.length})`;
  document.getElementById('m1-done-label').textContent = `已完成区 (${M1.done.length})`;
  const phaseText = {
    idle: '等待中...', 
    pickFromQueue: `从待充区取电池 (${M1.queue.length}个剩余)`, 
    connectToDevice: '连接电池到设备',
    operateLaptop: '操作员配置测试参数',
    returnHomeBeforeCharge: '返回待命位置',
    charging: M1.isChargingPhase ? '充电中 (蓝色)' : '放电中 (黄色)', 
    pickFromDevice: '从设备取下电池',
    moveToDone: `搬运到已完成区 (${M1.done.length}个完成)`, 
    returnHome: '返回'
  };
  document.getElementById('m1-phase-label').textContent = phaseText[M1.phase] || '';
  
  for (let i = 0; i < m1BatteryCount; i += 1) {
    const group = document.getElementById(`m1-battery-${i}`);
    const fill = document.getElementById(`m1-battery-fill-${i}`);
    const percent = document.getElementById(`m1-battery-percent-${i}`);
    const level = M1.batteryLevels[i];
    const isActiveBattery = M1.activeAtDevice === i && M1.phase === 'charging';
    const fillColor = isActiveBattery ? (M1.isChargingPhase ? COLORS.batCharge : COLORS.batDis) : (level > 0 ? COLORS.batFull : COLORS.batEmpty);
    
    fill.setAttribute('fill', fillColor);
    fill.setAttribute('width', Math.max(0, 48 * level));
    percent.textContent = `${Math.round(level * 100)}%`;
    
    let x = 0, y = 0;
    if (M1.done.includes(i)) {
      x = m1DoneBase.x + i * m1DoneBase.spacing;
      y = m1DoneBase.y;
    } else if (M1.activeAtDevice === i && M1.phase !== 'returnHome') {
      x = m1ActivePosition.x;
      y = m1ActivePosition.y;
    } else if (M1._carryBatteryIdx === i || M1._pickedBattery === i) {
      x = M1.personPos.x + m1PersonOffset.x;
      y = M1.personPos.y + m1PersonOffset.y;
    } else {
      x = m1QueueBase.x + i * m1QueueBase.spacing;
      y = m1QueueBase.y;
    }
    group.setAttribute('transform', `translate(${x},${y})`);
  }
  
  const cable = document.getElementById('m1-cable');
  cable.setAttribute('class', `cable ${M1.phase === 'charging' ? (M1.isChargingPhase ? 'charge' : 'discharge') : ''}`.trim());
}

function renderMethod2() {
  let phaseText = '等待中...';
  if (M2.phase === 'idle') {
    phaseText = '测试员连接电缆中...';
  } else if (M2.phase === 'charging') {
    phaseText = '级联充放电中';
  }
  document.getElementById('m2-phase-line').textContent = phaseText;

  const isCharging = M2.phase === 'charging';
  document.getElementById('m2-cloud').querySelector('.icon-cloud').classList.toggle('active', isCharging);
  document.getElementById('m2-db').querySelectorAll('.icon-db').forEach((el) => el.classList.toggle('active', isCharging));
  document.getElementById('m2-data-upload').className.baseVal = isCharging ? 'data-path flow-data' : 'data-path';
  document.getElementById('m2-cloud-db').className.baseVal = isCharging ? 'data-path flow-data' : 'data-path';
  document.getElementById('m2-data-config').className.baseVal = isCharging ? 'data-path flow-control' : 'data-path';

  for (let i = 0; i < m1BatteryCount; i += 1) {
    const fill = document.getElementById(`m2-battery-fill-${i}`);
    const percent = document.getElementById(`m2-battery-percent-${i}`);
    const port = document.getElementById(`m2-port-${i}`);
    const cable = document.getElementById(`m2-cable-${i}`);
    const level = M2.batteryLevels[i];
    const isSource = M2.phase === 'charging' && M2.energySource === i;
    const isTarget = M2.phase === 'charging' && M2.currentTargetBattery === i;

    fill.setAttribute('fill', isTarget ? COLORS.batCharge : isSource ? COLORS.batDis : (level > 0 ? COLORS.batFull : COLORS.batEmpty));
    fill.setAttribute('width', Math.max(0, 48 * level));
    percent.textContent = `${Math.round(level * 100)}%`;
    port.classList.toggle('active', M2.cablesConnected[i]);

    let cableCls = 'cable';
    if (M2.phase === 'charging' && M2.cablesConnected[i]) {
      if (M2.energySource === 'device' && i === M2.currentTargetBattery) {
        cableCls = 'cable charge';
      } else if (M2.energySource !== 'device') {
        if (i === M2.energySource) cableCls = 'cable discharge';
        else if (i === M2.currentTargetBattery) cableCls = 'cable charge';
      }
    }
    cable.className.baseVal = cableCls;
  }
}

function updateMethod1(elapsed) {
  const cycleTime = 8.0;
  const totalCycle = cycleTime * m1BatteryCount;
  const t = elapsed % totalCycle;
  
  if (t < 0.1) {
    M1.queue = [0,1,2,3];
    M1.done = [];
    M1.activeAtDevice = -1;
    M1._carryBatteryIdx = undefined;
    M1._pickedBattery = -1;
    M1.batteryLevels.fill(0.3);
    M1.isChargingPhase = true;
    M1.phase = 'idle';
    M1.personTarget = { x: m1PersonHome.x, y: m1PersonHome.y };
  }
  
  const batteryIdx = Math.min(m1BatteryCount - 1, Math.floor(t / cycleTime));
  const bt = t % cycleTime;
  const currentBattery = batteryIdx;
  const alreadyDone = M1.done.includes(currentBattery);
  const alreadyActive = M1.activeAtDevice === currentBattery;
  const beingCarried = M1._carryBatteryIdx === currentBattery;
  const devY = 290;
  const ARRIVE_THRESHOLD = 25;
  const personArrived = (tx, ty) => Math.hypot(M1.personPos.x - tx, M1.personPos.y - ty) < ARRIVE_THRESHOLD;
  const laptopX = 380, laptopY = 165;
  
  if (alreadyDone || (alreadyActive && bt >= 6.8)) {
    M1.phase = 'returnHome';
    M1.personTarget = { x: m1PersonHome.x, y: m1PersonHome.y };
  } else if (bt < 0.8) {
    M1.phase = 'pickFromQueue';
    const x = m1QueueBase.x + currentBattery * m1QueueBase.spacing;
    const tx = x;
    const ty = m1QueueBase.y - 35;
    M1.personTarget = { x: tx, y: ty };
    if (personArrived(tx, ty) && !alreadyActive && !beingCarried) {
      const qi = M1.queue.indexOf(currentBattery);
      if (qi >= 0) { M1.queue.splice(qi, 1); }
      M1._carryBatteryIdx = currentBattery;
    }
  } else if (bt < 1.6) {
    M1.phase = 'connectToDevice';
    const tx = 560, ty = devY;
    M1.personTarget = { x: tx, y: ty };
    if (personArrived(tx, ty) && M1._carryBatteryIdx === currentBattery) {
      M1.activeAtDevice = currentBattery;
      M1._carryBatteryIdx = undefined;
    }
  } else if (bt < 2.4) {
    M1.phase = 'operateLaptop';
    M1.personTarget = { x: laptopX, y: laptopY };
  } else if (bt < 3.0) {
    M1.phase = 'returnHomeBeforeCharge';
    M1.personTarget = { x: m1PersonHome.x, y: m1PersonHome.y };
  } else if (bt < 6.0) {
    M1.phase = 'charging';
    M1.personTarget = { x: m1PersonHome.x, y: m1PersonHome.y };
    if (M1.activeAtDevice === currentBattery) {
      const cp = (bt - 3.0) / 3.0;
      if (cp < 0.5) {
        M1.isChargingPhase = true;
        M1.batteryLevels[currentBattery] = Math.min(1, 0.3 + cp * 2 * 0.7);
      } else {
        M1.isChargingPhase = false;
        M1.batteryLevels[currentBattery] = Math.max(0, 1 - (cp - 0.5) * 2);
      }
    }
  } else if (bt < 6.8) {
    M1.phase = 'pickFromDevice';
    const tx = 560, ty = devY;
    M1.personTarget = { x: tx, y: ty };
    if (personArrived(tx, ty) && M1.activeAtDevice === currentBattery) {
      M1._pickedBattery = currentBattery;
      M1.activeAtDevice = -1;
    }
  } else if (bt < 7.6) {
    M1.phase = 'moveToDone';
    if (M1._pickedBattery === currentBattery && !M1.done.includes(currentBattery)) {
      M1._carryBatteryIdx = currentBattery;
    }
    const x = m1DoneBase.x + currentBattery * m1DoneBase.spacing;
    const tx = x;
    const ty = m1DoneBase.y - 35;
    M1.personTarget = { x: tx, y: ty };
    if (personArrived(tx, ty) && M1._pickedBattery === currentBattery && !M1.done.includes(currentBattery)) {
      M1.done.push(currentBattery);
      M1.batteryLevels[currentBattery] = 0;
      M1._carryBatteryIdx = undefined;
      M1._pickedBattery = -1;
    }
  } else {
    M1.phase = 'returnHome';
    M1.personTarget = { x: m1PersonHome.x, y: m1PersonHome.y };
    if (M1._pickedBattery >= 0 && !M1.done.includes(M1._pickedBattery)) {
      M1.done.push(M1._pickedBattery);
      M1.batteryLevels[M1._pickedBattery] = 0;
      M1._pickedBattery = -1;
    }
  }
  
  M1.personPos.x += (M1.personTarget.x - M1.personPos.x) * 0.12;
  M1.personPos.y += (M1.personTarget.y - M1.personPos.y) * 0.12;
  document.getElementById('m1-person').setAttribute('transform', `translate(${M1.personPos.x},${M1.personPos.y})`);

  const screen = document.getElementById('m1-laptop-screen');
  const screenText = document.getElementById('m1-laptop-text');
  if (M1.phase === 'operateLaptop') {
    screen.setAttribute('fill', 'rgba(0,122,255,0.55)');
    screenText.textContent = '...';
  } else {
    screen.setAttribute('fill', 'rgba(0,122,255,0.15)');
    screenText.textContent = 'CSV';
  }

  const m1Day = Math.floor(t / cycleTime) + 1;
  const m1Mins = (bt / cycleTime) * 8 * 60;
  const m1H = 9 + Math.floor(m1Mins / 60);
  const m1M = m1Mins % 60;
  setClockHands('m1', m1H, m1M);
  document.getElementById('m1-clock-time').textContent = `${pad(m1H)}:${pad(Math.floor(m1M))}`;
  document.getElementById('m1-clock-day').textContent = `第 ${m1Day}/4 天`;
}

function updateMethod2(elapsed) {
  const idleDuration = 4;
  const chargingDuration = 4 * 6.5;
  const cycleDuration = idleDuration + chargingDuration;
  const t = elapsed % cycleDuration;

  if (t < idleDuration) {
    M2.phase = 'idle';
    const connectRate = t / idleDuration;
    const cablesToConnect = Math.floor(connectRate * COUNT);
    for (let i = 0; i < COUNT; i += 1) {
      M2.cablesConnected[i] = i < cablesToConnect;
    }
    if (t < 0.1) {
      M2.batteryLevels.fill(0.3);
      M2.currentTargetBattery = 0;
      M2.energySource = 'device';
      M2.currentFlowType = 'charge';
      M2.personPos = { x: 1230, y: 640 };
    }
    const currentConnecting = Math.min(COUNT - 1, Math.floor(t / (idleDuration / COUNT)));
    M2.personTarget = { x: 1130, y: m2BatteryYStart + currentConnecting * m2BatterySpacing };
  } else {
    M2.phase = 'charging';
    const chargeT = t - idleDuration;
    const timePerBattery = chargingDuration / COUNT;
    const currentIdx = Math.min(COUNT - 1, Math.floor(chargeT / timePerBattery));
    const localProgress = (chargeT % timePerBattery) / timePerBattery;
    M2.currentTargetBattery = currentIdx;

    if (currentIdx === 0) {
      M2.energySource = 'device';
      M2.currentFlowType = 'charge';
      M2.batteryLevels[0] = 0.3 + localProgress * 0.7;
    } else {
      M2.energySource = currentIdx - 1;
      M2.batteryLevels[currentIdx - 1] = Math.max(0, 1 - localProgress);
      M2.batteryLevels[currentIdx] = 0.3 + localProgress * 0.7;
      M2.currentFlowType = localProgress < 0.5 ? 'discharge' : 'charge';
    }

    for (let i = 0; i < currentIdx - 1; i += 1) {
      M2.batteryLevels[i] = 0;
    }
    M2.cablesConnected.fill(true);

    M2.personTarget = { x: 1230, y: 640 };
  }

  M2.personPos.x += (M2.personTarget.x - M2.personPos.x) * 0.1;
  M2.personPos.y += (M2.personTarget.y - M2.personPos.y) * 0.1;
  const m2Person = document.getElementById('m2-person');
  m2Person.setAttribute('transform', `translate(${M2.personPos.x},${M2.personPos.y})`);
  const fadeOut = M2.phase === 'charging' && Math.hypot(M2.personPos.x - 1230, M2.personPos.y - 640) < 40;
  m2Person.setAttribute('opacity', fadeOut ? '0.25' : '1');

  const m2TotalMins = (t / cycleDuration) * 24 * 60;
  const m2AbsMins = 9 * 60 + m2TotalMins;
  const m2H = Math.floor(m2AbsMins / 60) % 24;
  const m2M = m2AbsMins % 60;
  const m2DayN = m2AbsMins / 60 >= 24 ? 2 : 1;
  setClockHands('m2', m2H, m2M);
  document.getElementById('m2-clock-time').textContent = `${pad(m2H)}:${pad(Math.floor(m2M))}`;
  document.getElementById('m2-clock-day').textContent = `第 ${m2DayN} 天 · 24h`;
}

function render() {
  const elapsed = (performance.now() - startTime) / 1000;
  updateMethod1(elapsed);
  updateMethod2(elapsed);
  renderMethod1();
  renderMethod2();
  requestAnimationFrame(render);
}

requestAnimationFrame(render);
