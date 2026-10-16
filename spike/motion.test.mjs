import test from 'node:test';
import assert from 'node:assert/strict';
import { gravityAngle, Steering, NeutralCalibration, summarize } from './motion.mjs';

test('missing, non-finite and near-flat gravity cannot steer', () => {
  for (const input of [null, { x: null, y: 9 }, { x: NaN, y: 9 }, { x: 0, y: 0.5 }]) {
    assert.equal(gravityAngle(input), null);
  }
  assert.equal(gravityAngle({ x: 0, y: 9.8 }), 0);
});
test('relative calibration crosses angle wrap without full-lock spikes', () => {
  const input = new Steering();
  input.calibrate(179); input.update(-179, 0);
  assert.equal(input.update(-179, 100), 0); // Two degrees, inside dead zone.
  input.update(-160, 200);
  assert.ok(input.value > 0 && input.value < 1);
});
test('uncalibrated, reset, limits and inversion', () => {
  const input = new Steering();
  assert.equal(input.update(80, 10), 0);
  assert.equal(input.calibrate(null), false);
  input.calibrate(0); input.update(90, 0);
  assert.ok(input.update(90, 250) > 0.9);
  assert.ok(input.value <= 1);
  input.reset(); assert.equal(input.value, 0);
  assert.equal(input.update(90, 500), 0);
  input.calibrate(0); input.update(90, 0, true);
  assert.ok(input.update(90, 250, true) < -0.9);
});
test('smoothing is independent of sensor update frequency', () => {
  const run = step => {
    const input = new Steering(); input.calibrate(0);
    for (let t = 0; t <= 240; t += step) input.update(35, t);
    return input.value;
  };
  assert.ok(Math.abs(run(10) - run(40)) < 1e-10);
});
test('rate and gaps are measured from sensor arrivals', () => {
  assert.equal(summarize([]).hz, null);
  const result = summarize([0, 40, 80, 120].map(time => ({ time, steering: 0 })));
  assert.equal(result.hz, 25); assert.equal(result.p95GapMs, 40);
  assert.equal(result.steeringStdDev, 0);
});
test('raw sensor noise remains visible inside the steering dead zone and across angle wrap', () => {
  const result = summarize([{ time: 0, angle: 179, steering: 0 }, { time: 40, angle: -179, steering: 0 }]);
  assert.equal(result.rawAngleStdDevDeg, 1);
  assert.equal(result.steeringStdDev, 0);
});
test('calibration ignores the tap and averages a stable grip across the angle boundary', () => {
  const calibration = new NeutralCalibration(); calibration.begin(0);
  assert.equal(calibration.push(60, 100).state, 'settling');
  let result;
  for (let t = 1000; t <= 1640; t += 40) {
    result = calibration.push(t % 80 === 0 ? 179 : -179, t);
    if (result.state === 'complete') break;
  }
  assert.equal(result.state, 'complete');
  assert.ok(Math.abs(result.neutral) > 178);
  assert.equal(calibration.active, false);
});
test('calibration waits for a steady grip and times out instead of accepting a turn', () => {
  const calibration = new NeutralCalibration(); calibration.begin(0);
  calibration.push(0, 1000);
  assert.equal(calibration.push(20, 1100).state, 'moving');
  assert.equal(calibration.push(20, 8000).state, 'timeout');
  assert.equal(calibration.active, false);
});


test('sensitivity scales steering, retains dead zone and limits, tolerates invalid settings', () => {
 const result=(angle,gain)=>{const s=new Steering();s.calibrate(0);for(let t=0;t<=1000;t+=10)s.update(angle,t,false,gain);return s.value;};
 assert.ok(Math.abs(result(19,.5)-.25)<.001);
 assert.ok(Math.abs(result(19,1)-.5)<.001);
 assert.ok(Math.abs(result(19,2)-1)<.001);
 assert.equal(result(2,2),0);
 assert.ok(Math.abs(result(19,NaN)-.5)<.001);
 assert.ok(result(80,2)<=1);
});

import { WheelMotion, ShakeDetector } from './motion.mjs';
test('forward tipping stays live without gyro and missing sensors still stop',()=>{
 const w=new WheelMotion();let now=0;
 const sample=pitch=>({accelerationIncludingGravity:{x:0,y:9.8*Math.cos(pitch),z:9.8*Math.sin(pitch)},rotationRate:{alpha:null}});
 for(let cycle=0;cycle<3;cycle++)for(let n=0;n<=120;n++){
  const angle=w.update(sample(Math.sin(n/120*Math.PI)*Math.PI*.65),now+=16);
  assert.ok(Number.isFinite(angle),'Tipping stopped input');
  assert.ok(Math.abs(angle)<.001,'Forward tipping steered');
 }
 assert.equal(w.update({accelerationIncludingGravity:null,rotationRate:null},now+16),null);
 const flat=new WheelMotion();assert.equal(flat.update(sample(Math.PI/2),0),0);
});
const motion=(rate,x=0,y=0)=>({rotationRate:rate===null?null:{alpha:rate},accelerationIncludingGravity:{x,y,z:9.81},acceleration:{x:0,y:0,z:0}});
const atAngle=(angle,rate=null)=>motion(rate,9.8*Math.sin(angle*Math.PI/180),9.8*Math.cos(angle*Math.PI/180));
test('layout changes without sensor remapping preserve genuine physical turns',()=>{
 const wheel=new WheelMotion();wheel.update(atAngle(0),0,0);
 for(let angle=1;angle<=100;angle++)assert.ok(Math.abs(wheel.update(atAngle(angle),angle*16,angle<45?0:90)-angle)<.001);
 for(let angle=99;angle>=0;angle--)wheel.update(atAngle(angle),(200-angle)*16,angle<45?0:90);
 assert.ok(Math.abs(wheel.angle)<.001);
});
test('flat wheel integrates both directions, ignores tiny gyro noise and sample gaps',()=>{
 const w=new WheelMotion(); assert.equal(w.update(motion(0),0),0);
 for(let t=10;t<=1000;t+=10)w.update(motion(30),t);
 assert.ok(Math.abs(w.angle-30)<.001);
 for(let t=1010;t<=2000;t+=10)w.update(motion(-30),t);
 assert.ok(Math.abs(w.angle)<.001);
 w.update(motion(.2),2010);assert.ok(Math.abs(w.angle)<.001);
 w.update(motion(100),5000);assert.ok(Math.abs(w.angle)<.001);
 assert.ok(Math.abs(w.update(motion(null),5010))<.001,'Flat gravity keeps the wheel live without gyro');
});
test('upright gravity fallback and transitions preserve angle without sudden jumps',()=>{
 const w=new WheelMotion();w.update(motion(null,0,9),0);
 const radians=20*Math.PI/180;
 assert.ok(Math.abs(w.update(motion(null,9*Math.sin(radians),9*Math.cos(radians)),20)-20)<.001);
 assert.ok(Math.abs(w.update(motion(0),40)-20)<.001);
 // Returning upright at a different physical grip must not snap the wheel.
 assert.ok(Math.abs(w.update(motion(0,0,9),60)-20)<.001);
 const shaken=motion(0,9,0);shaken.acceleration.x=12;
 assert.ok(Math.abs(w.update(shaken,80)-20)<.001);
 w.reset();assert.equal(w.update(motion(0),100),0);
});
test('shake needs opposed peaks, rejects bumps and obeys cooldown and enable gate',()=>{
 const s=new ShakeDetector();const a=x=>({x,y:0,z:0});
 assert.equal(s.update(a(4),0),false);
 assert.equal(s.update(a(12),100),false);
 assert.equal(s.update(a(-12),120),false);
 assert.equal(s.update(a(-12),200),true);
 assert.equal(s.update(a(12),300),false);
 assert.equal(s.update(a(-12),400),false);
 assert.equal(s.update(a(12),1500,false),false);
 assert.equal(s.update(a(-12),1600),false);
 assert.equal(s.update(a(12),1700),true);
 s.update(a(12),3000);assert.equal(s.update(a(-12),3500),false);
 assert.equal(s.update(null,3600),false);
});

test('screen orientation cannot alter a calibrated turn or its neutral',()=>{
 for(const gyro of [null,0]){
  const wheel=new WheelMotion(),steering=new Steering();let now=0;
  steering.calibrate(wheel.update(atAngle(90,gyro),now));
  for(const layout of [0,90,0,270,180,90]){
   for(let n=0;n<90;n++){
    steering.update(wheel.update(atAngle(110,gyro),now+=16,layout),now,false,.5);
   }
   assert.equal(steering.neutral,90);
   assert.ok(steering.value>.25&&steering.value<.28);
  }
  for(let n=0;n<90;n++)steering.update(wheel.update(atAngle(90,gyro),now+=16,0),now,false,.5);
  assert.ok(Math.abs(steering.value)<.001);
 }
});
test('a genuine quick quarter turn is not misclassified as a viewport remap',()=>{
 const wheel=new WheelMotion();wheel.update(atAngle(0),0);
 assert.equal(wheel.update(atAngle(90),50),90);
 assert.equal(wheel.update(atAngle(0),100),0);
});
