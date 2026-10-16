export const wrapDegrees = angle => ((angle + 180) % 360 + 360) % 360 - 180;

export function gravityAngle(gravity) {
  if (!gravity || !Number.isFinite(gravity.x) || !Number.isFinite(gravity.y)) return null;
  // Near-flat devices lack a stable gravity projection into the screen plane.
  if (Math.hypot(gravity.x, gravity.y) < 3) return null;
  return Math.atan2(gravity.x, gravity.y) * 180 / Math.PI;
}

// Ignore the initial tap/grip adjustment, then average a stable window in the
// device coordinate frame. Browser viewport orientation is intentionally absent.
export class NeutralCalibration {
  active = false;
  started = 0;
  readings = [];
  begin(now) { this.active = true; this.started = now; this.readings = []; }
  cancel() { this.active = false; this.readings = []; }
  push(angle, now) {
    if (!this.active || !Number.isFinite(angle)) return { state: 'idle' };
    if (now - this.started >= 8000) { this.cancel(); return { state: 'timeout' }; }
    if (now - this.started < 1000) return { state: 'settling' };
    this.readings.push({ angle, time: now });
    const anchor = this.readings[0];
    const offsets = this.readings.map(reading => wrapDegrees(reading.angle - anchor.angle));
    if (Math.max(...offsets) - Math.min(...offsets) > 4) {
      this.readings = [{ angle, time: now }]; return { state: 'moving' };
    }
    if (now - anchor.time < 600 || this.readings.length < 8) return { state: 'holding' };
    const neutral = wrapDegrees(anchor.angle + offsets.reduce((sum, value) => sum + value, 0) / offsets.length);
    this.cancel(); return { state: 'complete', neutral };
  }
}

export class Steering {
  neutral = null;
  value = 0;
  previousMs = null;

  reset() { this.neutral = null; this.value = 0; this.previousMs = null; }
  calibrate(angle) {
    if (!Number.isFinite(angle)) return false;
    this.neutral = angle; this.value = 0; this.previousMs = null;
    return true;
  }
  update(angle, nowMs, invert = false, sensitivity = 1) {
    if (this.neutral === null || !Number.isFinite(angle)) return 0;
    const delta = wrapDegrees(angle - this.neutral);
    const gain=Number.isFinite(sensitivity)?Math.max(.5,Math.min(2,sensitivity)):1;
    const target = Math.sign(delta) * Math.min(1, Math.max(0, Math.abs(delta) - 3) * gain / 32) * (invert ? -1 : 1);
    const elapsed = this.previousMs === null ? 0 : Math.max(0, Math.min(250, nowMs - this.previousMs));
    this.previousMs = nowMs;
    this.value += (target - this.value) * (1 - Math.exp(-elapsed / 50));
    return this.value;
  }
}

export function summarize(samples) {
  if (samples.length < 2) return { samples: samples.length, hz: null, p95GapMs: null, steeringStdDev: null, rawAngleStdDevDeg: null };
  const gaps = samples.slice(1).map((s, i) => s.time - samples[i].time).sort((a, b) => a - b);
  const mean = samples.reduce((total, s) => total + s.steering, 0) / samples.length;
  const angles = samples.every(s => Number.isFinite(s.angle)) ? samples.map(s => wrapDegrees(s.angle - samples[0].angle)) : [];
  const angleMean = angles.length ? angles.reduce((sum, angle) => sum + angle, 0) / angles.length : 0;
  return {
    samples: samples.length,
    hz: 1000 * (samples.length - 1) / (samples.at(-1).time - samples[0].time),
    p95GapMs: gaps[Math.ceil(gaps.length * 0.95) - 1],
    steeringStdDev: Math.sqrt(samples.reduce((total, s) => total + (s.steering - mean) ** 2, 0) / samples.length),
    rawAngleStdDevDeg: angles.length ? Math.sqrt(angles.reduce((sum, angle) => sum + (angle - angleMean) ** 2, 0) / angles.length) : null,
  };
}

// DeviceMotion rotationRate.alpha is rotation about the screen normal in Safari.
// Gravity anchors upright steering; gyro carries the angle through a flat grip.
export class WheelMotion {
  angle = null; previousMs = null; gravityOffset = null;

  reset() { this.angle=null; this.previousMs=null; this.gravityOffset=null; }
  // DeviceMotion axes belong to the physical device, not the rotating viewport.
  // https://www.w3.org/TR/orientation-event/#device-coordinate-frame
  update(event, now) {
    const gravity=gravityAngle(event.accelerationIncludingGravity);
    const rate=event.rotationRate?.alpha;
    const gyro=Number.isFinite(rate);
    const elapsed=this.previousMs===null?0:now-this.previousMs;
    this.previousMs=now;
    // A forward tip can remove the screen-plane gravity projection while Safari
    // briefly omits gyro readings. Keep the last wheel angle through that grip;
    // fresh gravity samples still count as live input. Truly missing sensors do not.
    const g=event.accelerationIncludingGravity;
    const hasGravity=g&&[g.x,g.y,g.z].every(Number.isFinite)&&Math.hypot(g.x,g.y,g.z)>3;
    if(gravity===null&&!gyro&&!hasGravity){this.gravityOffset=null;return null;}
    if(this.angle===null)this.angle=gravity??0;
    // Never integrate across missing samples or background tabs.
    const dt=elapsed>0&&elapsed<=250?elapsed/1000:0;
    if(gyro&&Math.abs(rate)>.35)this.angle=wrapDegrees(this.angle+rate*dt);
    const a=event.acceleration;
    const moving=a&&[a.x,a.y,a.z].every(Number.isFinite)&&Math.hypot(a.x,a.y,a.z)>3;
    // Avoid the noisy edge of the flat region and accelerometer shake spikes.
    const reliable=gravity!==null&&Math.hypot(event.accelerationIncludingGravity.x,event.accelerationIncludingGravity.y)>4&&!moving;
    if(reliable){
      if(this.gravityOffset===null)this.gravityOffset=wrapDegrees(this.angle-gravity);
      const target=wrapDegrees(gravity+this.gravityOffset);
      const correction=gyro?1-Math.exp(-dt/.35):1;
      this.angle=wrapDegrees(this.angle+wrapDegrees(target-this.angle)*correction);
    }else if(gravity===null)this.gravityOffset=null;
    return this.angle;
  }
}

// Require two opposed acceleration peaks, not a single bump or steady turning.
export class ShakeDetector {
  peak=null; lastFire=-Infinity;
  reset(){this.peak=null;}
  update(acceleration, now, enabled=true){
    if(!enabled||now-this.lastFire<1200){this.reset();return false;}
    if(!acceleration||![acceleration.x,acceleration.y,acceleration.z].every(Number.isFinite)){this.reset();return false;}
    const vector=[acceleration.x,acceleration.y,acceleration.z];
    const strength=Math.hypot(...vector);
    if(this.peak&&now-this.peak.time>450)this.peak=null;
    if(strength<9)return false;
    if(this.peak){
      const elapsed=now-this.peak.time;
      const dot=vector.reduce((sum,v,i)=>sum+v*this.peak.vector[i],0)/(strength*this.peak.strength);
      if(elapsed>=60&&dot<-.5){this.lastFire=now;this.reset();return true;}
      if(elapsed<60)return false;
    }
    this.peak={vector,strength,time:now};return false;
  }
}
