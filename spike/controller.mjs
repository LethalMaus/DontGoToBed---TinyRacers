import { languages, resolveLanguage, translate } from './i18n.mjs';
import { WheelMotion, ShakeDetector, Steering, NeutralCalibration, summarize } from './motion.mjs';
import { EmulatorTransport } from './transport.mjs';

const CONTROLLER_VERSION = 'device-frame-2026-10-14';
const el = id => document.getElementById(id);
let language=resolveLanguage(navigator.language);
try{language=resolveLanguage(localStorage.getItem('tiny-racers-language')||navigator.language);}catch{}
const textSources=new Map();
function setText(id,source){textSources.set(id,String(source));el(id).textContent=translate(source,language);}
const staticNodes=[];
const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
while(walker.nextNode()){const node=walker.currentNode;if(node.nodeValue.trim()&&!node.parentElement.closest('script,style,pre'))staticNodes.push([node,node.nodeValue]);}
const staticAttributes=[];
document.querySelectorAll('[aria-label]').forEach(node=>staticAttributes.push([node,node.getAttribute('aria-label')]));
for(const select of [el('language'),el('tv-language')])for(const [code,name] of Object.entries(languages)){const option=document.createElement('option');option.value=code;option.textContent=name;select.append(option);}
function applyLanguage(){
 document.documentElement.lang=language;el('language').value=language;
 for(const [node,source] of staticNodes)if(node.isConnected)node.nodeValue=(source.match(/^\s*/)?.[0]??'')+translate(source.trim(),language)+(source.match(/\s*$/)?.[0]??'');
 for(const [node,source] of staticAttributes)node.setAttribute('aria-label',translate(source,language));
 for(const [id,source] of textSources)el(id).textContent=translate(source,language);
}
el('language').onchange=()=>{language=resolveLanguage(el('language').value);try{localStorage.setItem('tiny-racers-language',language);}catch{}applyLanguage();};
el('tv-language').onchange=()=>transport.chooseLanguage(el('tv-language').value);
applyLanguage();
const cloudRelay = location.hostname.endsWith('.workers.dev');
if (cloudRelay) el('save').hidden = true;
const pairedToken = new URLSearchParams(location.hash.slice(1)).get('token');
if (/^(?:[0-9a-f]{8}|[0-9a-f]{32})$/.test(pairedToken ?? '')) el('token').value = pairedToken;
window.addEventListener('hashchange', () => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  if (/^(?:[0-9a-f]{8}|[0-9a-f]{32})$/.test(token ?? '') && token !== el('token').value) {
    transport.stop(); el('token').value = token; el('setup').open = true;
  }
});
// Remember each device's preferred direction; storage may be blocked in private browsing.
try {
  const saved = localStorage.getItem('tiny-racers-invert');
  if (saved === 'true' || saved === 'false') el('invert').checked = saved === 'true';
} catch {}
// Start the family playtest at 50%, including controllers with older saved settings.
// Later adjustments remain per-device preferences.
const sensitivityKey='tiny-racers-sensitivity-v2';
let sensitivity=.5;
try{const saved=Number(localStorage.getItem(sensitivityKey));if(Number.isFinite(saved)&&saved>=.5&&saved<=2)sensitivity=saved;}catch{}
el('sensitivity').value=String(sensitivity*100);
function setSensitivity(){
  sensitivity=Math.max(.5,Math.min(2,Number(el('sensitivity').value)/100));
  el('sensitivity-value').value=Math.round(sensitivity*100)+'%';
  try{localStorage.setItem(sensitivityKey,String(sensitivity));}catch{}
}
setSensitivity();
el('sensitivity').oninput=setSensitivity;
el('reset-sensitivity').onclick=()=>{el('sensitivity').value='50';setSensitivity();};
const steering = new Steering();
const wheelMotion = new WheelMotion();
const shake = new ShakeDetector();
const calibration = new NeutralCalibration();
const samples = [];
const events = [];
let readyFlow=false,readyTimer=null;
let playerReady = false, currentState=null, currentId=null, autoSynced=false;
let autoItems=true;
try{autoItems=localStorage.getItem('tiny-racers-auto-items')!=='false';}catch{}
el('auto-items').checked=autoItems;
let shakeItems=true;
try{shakeItems=localStorage.getItem('tiny-racers-shake-items')!=='false';}catch{}
el('shake-items').checked=shakeItems;
el('shake-items').onchange=()=>{shakeItems=el('shake-items').checked;shake.reset();try{localStorage.setItem('tiny-racers-shake-items',String(shakeItems));}catch{}};
const motionPanel=document.querySelector('.motion-panel');
const motionHome=document.createComment('motion home');motionPanel.before(motionHome);
document.querySelectorAll('body>details:not(#setup)').forEach(node=>el('pause-controls').append(node));
el('pause-controls').append(el('back'));

const transport = new EmulatorTransport(message => { setText('network', message); }, (state, id) => {
  currentState=state;currentId=id;
  el('tv-language').disabled=!state;el('tv-language').value=state?.language??'en';
  document.body.classList.toggle('connected',!!state);
  el('options-button').hidden=!state;
  if(!state){cancelReadyFlow();autoSynced=false;if(el('options-menu').open)el('options-menu').close();}
  if(state&&!autoSynced){autoSynced=true;transport.setAutoItems(autoItems);}
  const paused=state?.race?.pausedBy??0;
  el('pause-controls').prepend(motionPanel);
  setText('pause-title',paused?paused===5?'TV paused':`Player ${paused} paused`:'Options');
  el('resume').disabled=paused>0&&paused!==id&&paused!==5;
  if(paused&&!el('options-menu').open)el('options-menu').showModal();
  if(!paused&&el('options-menu').open&&el('options-menu').dataset.racePause==='true')el('options-menu').close();
  if(paused)el('options-menu').dataset.racePause='true';
  const me = state?.players.find(player => player.id === id);
  document.body.classList.toggle('racing', !!state?.race);
  el('driver').hidden = !me;
  if (me) {
    setText('driver-name', `P${id} · ${me.name}`);
    const avatar = ['/assets/leo_front.png', '/assets/ian_front.png', '/assets/papa_front.png', '/assets/mammy.png'][me.character];
    if (avatar && el('driver-avatar').getAttribute('src') !== avatar) el('driver-avatar').setAttribute('src', avatar);
  }
  document.querySelectorAll('[data-character]').forEach(button => {
    button.disabled = !me || !!state?.race;
    button.setAttribute('aria-pressed', String(Number(button.dataset.character) === me?.character));
  });
  document.querySelectorAll('[data-track]').forEach(button=>{
    button.disabled=!me||!!state?.race;button.setAttribute('aria-pressed',String(Number(button.dataset.track)===state?.track));
  });
  document.querySelectorAll('[data-laps]').forEach(button=>{button.disabled=!me||!!state?.race;button.setAttribute('aria-pressed',String(Number(button.dataset.laps)===(state?.laps??1)));});
  document.querySelectorAll('[data-bots]').forEach(button=>{
    button.disabled=!me||!!state?.race||Number(button.dataset.bots)>4-(state?.players.length??0);
    button.setAttribute('aria-pressed',String(Number(button.dataset.bots)===(state?.bots??0)));
  });
  setText('track-hint',['Flowing · table edges','Twisty · garden bends','Hairpins · 2 shortcuts'][state?.track??0]);
  playerReady = me?.ready ?? false;
  setText('ready', readyFlow?'Hold straight…':playerReady ? '✓ Ready!' : 'Ready!');
  el('ready').disabled = !me || readyFlow;
  el('leave').disabled = !me;
  el('start').disabled = !state?.allReady || !!state?.race;
  el('start').hidden = !!state?.race;
  el('back').hidden = !state?.race;
  const needsMotion = !!state?.race && steering.neutral === null;
  document.body.classList.toggle('needs-motion',needsMotion);
  el('ready').hidden = !!state?.race && !needsMotion;
  const car = state?.race?.cars.find(car => car.id === id);
  el('power-panel').hidden = !car || state?.race?.complete;
  el('power').disabled = state?.race?.pausedBy > 0 || car?.place !== 0 || !car?.power || car?.power === 5 || state?.race?.countdown > 0 || state?.race?.roundBreak > 0 || car?.airborne || car?.attack || steering.neutral === null;
  const icons=['🎁','⚡','●','💧','🔨','🥊','🦾'];
  setText('power', !car||car.place!==0?'✨ Back soon!':car.power===5?'🥊 Ready to punch!':car.power?`${icons[car.power]} ${car.powerName}`:'🎁 Collect a power-up!');
  setText('item-mode',autoItems?'AUTOMATIC ITEMS ON':shakeItems?'SHAKE OR TAP':'TAP YOUR ITEM');
  setText('item-help',autoItems?'Your item fires for you. You can also '+(shakeItems?'shake or tap!':'tap!'):shakeItems?'A short shake or a tap uses your item. Hold with both hands.':'Tap the big button to use your item.');
  setText('race-status',!car?'':state.race.complete?`#${car.place} · Points: ${car.points}`:paused?`Player ${paused} paused`:state.race.countdown>0?`Ready… ${Math.ceil(state.race.countdown)}`:car.grabbed?'Grabbed!':car.place<0?'You’ll be back soon!':`${car.points} ★`);
  const colours = ['Green', 'Blue', 'Orange', 'Purple'];
  setText('lobby',state?(state.allReady?'Everyone ready!':'Choose your racer, then tap Ready.'):'Connect to choose your racer.');
});
document.querySelectorAll('[data-character]').forEach(button => {
  button.onclick = () => transport.chooseCharacter(Number(button.dataset.character));
});
document.querySelectorAll('[data-track]').forEach(button=>{button.onclick=()=>transport.chooseTrack(Number(button.dataset.track));});
document.querySelectorAll('[data-laps]').forEach(button=>{button.onclick=()=>transport.chooseLaps(Number(button.dataset.laps));});
document.querySelectorAll('[data-bots]').forEach(button=>{button.onclick=()=>transport.chooseBots(Number(button.dataset.bots));});
el('options-button').onclick=()=>{
  if(currentState?.race&&!currentState.race.complete){transport.command('pause');}
  else{el('options-menu').dataset.racePause='false';el('options-menu').showModal();}
};
function resumePlay(){
  if(currentState?.race?.pausedBy)transport.command('resume');else el('options-menu').close();
}
el('resume').onclick=resumePlay;
el('options-menu').addEventListener('cancel',event=>{event.preventDefault();resumePlay();});
el('auto-items').onchange=()=>{autoItems=el('auto-items').checked;try{localStorage.setItem('tiny-racers-auto-items',String(autoItems));}catch{}transport.setAutoItems(autoItems);};
let angle = null;
let lastValid = -Infinity;
let listening = false;
let permission = 'not requested';
let screenAngle = getScreenAngle();
const motionTrace = [];
let rotationTrace = [], traceUntil = -Infinity, lastTraceMs = -Infinity;
const capabilities = {
  secureContext: window.isSecureContext,
  motionAPI: typeof window.DeviceMotionEvent !== 'undefined',
  permissionAPI: typeof window.DeviceMotionEvent?.requestPermission === 'function',
  userAgent: navigator.userAgent,
  origin: location.origin,
};
function getScreenAngle() { return screen.orientation?.angle ?? window.orientation ?? 0; }
function checkOrientation() {
  const next=getScreenAngle();
  if(next===screenAngle)return;
  screenAngle=next;
  rotationTrace=motionTrace.slice(-20);traceUntil=performance.now()+5000;
  events.push({time:new Date().toISOString(),message:'Viewport rotated; steering and calibrated grip unchanged.'});
  if(events.length>200)events.shift();
}
screen.orientation?.addEventListener('change',checkOrientation);
window.addEventListener('orientationchange',checkOrientation);
function report(message) {
  if (textSources.get('status') === message) return;
  setText('status', message);
  events.push({ time: new Date().toISOString(), message });
  if (events.length > 200) events.shift();
}
function invalidate(message) {
  cancelReadyFlow();
  transport.setReady(false); el('ready').disabled = true;
  angle = null; steering.reset(); wheelMotion.reset(); shake.reset(); calibration.cancel(); el('calibrate').disabled = true;
  setText('calibrate', 'Set straight ahead');
  report(message);
}
function pauseMotion(message) {
  angle = null; steering.value = 0; steering.previousMs = null;
  calibration.cancel(); el('calibrate').disabled = true;
  setText('calibrate', 'Set straight ahead');
  report(message);
}
if (!capabilities.secureContext) {
  report('Open the secure controller link and allow motion in Safari.');
  el('enable').disabled = true;
} else if (!capabilities.motionAPI) {
  report('Motion controls are unavailable in this browser.');
  el('enable').disabled = true;
} else report('Ready to request motion access.');

async function enableMotion() {
  el('enable').disabled = true;
  try {
    if(!capabilities.secureContext||!capabilities.motionAPI)throw new Error('Motion is unavailable. Open the secure phone link.');
    // Keep requestPermission directly in the click handler, before other awaits.
    permission = capabilities.permissionAPI ? await DeviceMotionEvent.requestPermission() : 'not required';
    if (permission === 'denied') { report('Motion permission denied. Ask a grown-up to allow motion in Safari.'); return false; }
    if (!listening) window.addEventListener('devicemotion', onMotion);
    listening = true;
    report('Waiting for motion data. Hold your wheel comfortably, flat or upright.');
    setTimeout(() => {
      if (performance.now() - lastValid > 3000) report('Open the secure controller link and allow motion in Safari.');
    }, 3500);
    return true;
  } catch (error) {
    permission = 'error'; report('Motion request failed. Try Ready again.');events.push({time:new Date().toISOString(),message:String(error)});return false;
  } finally { el('enable').disabled = false; }
}
el('enable').onclick=enableMotion;
function onMotion(event) {
  if (document.hidden) return;
  const now = performance.now();
  checkOrientation();
  const vector=value=>value?['x','y','z'].map(k=>Number.isFinite(value[k])?Number(value[k].toFixed(3)):null):null;
  if(now-lastTraceMs>=100){
    lastTraceMs=now;
    const reading={time:Math.round(now),screen:screenAngle,legacy:window.orientation??null,
      gravity:vector(event.accelerationIncludingGravity),acceleration:vector(event.acceleration),
      gyro:event.rotationRate?['alpha','beta','gamma'].map(k=>Number.isFinite(event.rotationRate[k])?Number(event.rotationRate[k].toFixed(3)):null):null,
      angle,neutral:steering.neutral,steering:steering.value};
    motionTrace.push(reading);
    if(motionTrace.length>120)motionTrace.shift();
    if(now<=traceUntil&&rotationTrace.length<80)rotationTrace.push(reading);
  }
  const nextAngle = wheelMotion.update(event, now);
  if (nextAngle === null) {
    if (angle !== null) pauseMotion('No gyroscope reading. Raise the screen a little to use tilt steering.');
    return;
  }
  const first = angle === null;
  angle = nextAngle;
  lastValid = now;
  if(readyFlow&&!calibration.active)calibration.begin(now);
  if (calibration.active) {
    const result = calibration.push(angle, now);
    if (result.state === 'complete') {
      steering.calibrate(result.neutral); samples.length = 0;
      el('ready').disabled = !transport.ready;
      el('setup').open = false;
      report('Ready! Turn a little left or right. This grip is straight ahead.');
      if(readyFlow){
        readyFlow=false;clearTimeout(readyTimer);el('straight-dialog').close();
        transport.sendInput(0,false,true);transport.setReady(true);
      }
    } else if (result.state === 'timeout') {cancelReadyFlow();report('Let’s try again. Tap Ready and hold your wheel still.');}
    else if (result.state === 'settling') report('Get comfortable — keep your normal steering grip.');
    else report('Hold still… setting straight ahead.');
    if(readyFlow)setText('straight-hint',result.state==='moving'?'Nearly! Keep the wheel still.':'Hold it still for a moment…');
  }
  el('calibrate').disabled = calibration.active;
  setText('calibrate', calibration.active ? 'Hold still…' : 'Set straight ahead');
  if(shake.update(event.acceleration,now,shakeItems&&!readyFlow&&!calibration.active&&!el('options-menu').open&&!el('power').disabled&&transport.ready))useItem();
  steering.update(angle, now, el('invert').checked, sensitivity);
  samples.push({ time: now, angle, steering: steering.value, calibrated: steering.neutral !== null });
  if (samples.length > 18000) samples.shift();
  if (first) report(steering.neutral === null ? 'Motion is ready. Hold comfortably, then tap Set straight ahead.' : 'Motion resumed. Your straight-ahead setting is saved.');
}
el('calibrate').onclick = () => {
  const now = performance.now();
  if (now - lastValid > 250 || angle === null) return;
  steering.reset(); calibration.begin(now);
  transport.setReady(false); el('ready').disabled = true;
  el('calibrate').disabled = true; setText('calibrate', 'Hold still…');
  report('Get comfortable — keep your normal steering grip.');
};
el('invert').onchange = () => {
  steering.value = 0;
  try { localStorage.setItem('tiny-racers-invert', String(el('invert').checked)); } catch {}
  report('Steering inversion changed and remembered when browser storage is available.');
};
el('reset').onclick = () => { samples.length = 0; report('Measurement cleared; calibration retained.'); };
document.addEventListener('visibilitychange', () => {
  invalidate(document.hidden ? 'Page backgrounded; steering cleared.' : 'Page resumed. Recalibrate before steering.');
});
function diagnostic(includeSamples = true) {
  return {
    recordedAt: new Date().toISOString(), stage: 'motion-and-emulator-bridge-spike', controllerVersion: CONTROLLER_VERSION,
    hardwareMilestoneValidated: false, capabilities, permission,
    screenAngle, sensitivity, inverted: el('invert').checked, neutral: steering.neutral,
    observation: el('observation').value,
    metrics: summarize(samples), network: transport.metrics(), events: events.slice(-60),
    samples: includeSamples ? samples : samples.slice(-60),
    motionTrace: motionTrace.slice(-60), rotationTrace,
  };
}
el('export').onclick = () => {
  const blob = new Blob([JSON.stringify(diagnostic(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'tiny-racers-motion.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
el('save').onclick = async () => {
  el('save').disabled = true;
  try {
    const response = await fetch('/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(diagnostic(false)) });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const result = await response.json(); report(`Saved to Mac: ${result.filename}`);
  } catch (error) { report(`Could not save report: ${error.message}. Use Export diagnostic JSON instead.`); }
  finally { el('save').disabled = false; }
};
const ctx = el('preview').getContext('2d');
function draw() {
  if (angle !== null && performance.now() - lastValid > 250) pauseMotion('Waiting for motion. Steering is paused; your straight-ahead setting is saved.');
  ctx.clearRect(0, 0, 850, 160);
  ctx.fillStyle = '#ffd369';
  ctx.fillRect(400 + steering.value * 355, 50, 50, 60);
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
setInterval(() => {
  setText('metrics', JSON.stringify({
    controllerVersion: CONTROLLER_VERSION, ...capabilities, permission, screenAngle, calibrated: steering.neutral !== null,
    steering: Number(steering.value.toFixed(3)), ...summarize(samples),
    note: 'Metrics cover retained valid samples (maximum 18,000). No network measurements.',
  }, null, 2));
}, 500);

el('connect').onclick = () => {
  if (!/^(?:[0-9a-f]{8}|[0-9a-f]{32})$/.test(el('token').value.trim())) {
    setText('network', 'Enter the eight-character token shown on the TV.'); return;
  }
  transport.connect(el('token').value.trim());
  el('disconnect').disabled = false;
};
el('disconnect').onclick = () => { transport.stop(); el('disconnect').disabled = true; };
function cancelReadyFlow(){
  readyFlow=false;clearTimeout(readyTimer);calibration.cancel();
  if(el('straight-dialog').open)el('straight-dialog').close();
  el('ready').disabled=!transport.ready;
}
el('straight-cancel').onclick=cancelReadyFlow;
el('straight-dialog').addEventListener('cancel',event=>{event.preventDefault();cancelReadyFlow();});
el('ready').onclick = async () => {
  if(playerReady && !currentState?.race){transport.setReady(false);return;}
  if(readyFlow)return;
  readyFlow=true;el('ready').disabled=true;
  // The permission request is initiated by this tap, as required by iOS.
  const allowed=listening||await enableMotion();
  if(!readyFlow)return;
  if(!allowed){cancelReadyFlow();setText('ready-help',textSources.get('status')||el('status').textContent);return;}
  steering.reset();wheelMotion.reset();shake.reset();calibration.begin(performance.now());transport.setReady(false);
  setText('straight-hint','Hold comfortably, flat or upright, and keep still.');
  el('straight-dialog').showModal();
  readyTimer=setTimeout(()=>{if(readyFlow){cancelReadyFlow();setText('ready-help','Hold still and tap Ready to try again.');}},10000);
};
el('start').onclick = () => transport.command('start');
function useItem(){if(el('power').disabled)return;transport.command('use');el('power').disabled=true;}
el('power').onclick=useItem;
el('back').onclick = () => transport.command('lobby');
el('leave').onclick = () => { transport.leave(); el('disconnect').disabled = true; };
let reconnectOnVisible=false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    reconnectOnVisible=transport.wanted;
    transport.stop(); el('disconnect').disabled = true; el('synthetic').checked = false;
  } else if(reconnectOnVisible) {
    reconnectOnVisible=false;
    transport.connect(el('token').value.trim());el('disconnect').disabled=false;
  }
});
setInterval(() => {
  const synthetic = el('synthetic').checked;
  const value = document.hidden ? 0 : synthetic ? Math.sin(performance.now() / 800) :
    performance.now() - lastValid <= 250 ? steering.value : 0;
  const active = !document.hidden && (synthetic || (angle !== null && steering.neutral !== null && performance.now() - lastValid <= 250));
  transport.sendInput(value, synthetic, active);
}, 40);
setInterval(() => { setText('network-metrics', JSON.stringify(transport.metrics(), null, 2)); }, 500);
