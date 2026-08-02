/**
 * Smart Vessel Monitoring System — Data Simulator
 *
 * Generates realistic vessel telemetry data for the demo dashboard.
 * Simulates a vessel transiting the Solent (UK) with scheduled alarm events.
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const NM_TO_M = 1852;
const EARTH_RADIUS_M = 6_371_000;

// ─── Thresholds (from real modules) ─────────────────────────────────────────

export const PUG_THRESHOLDS = {
  WARNING_C: 28,
  CRITICAL_C: 32,
};

export const DEPTH_THRESHOLDS = {
  SAFE: 5.0,
  CAUTION: 1.0,   // < 1m under keel = DANGER
  DRAFT: 1.8,
  SAFETY_MARGIN: 1.0,
};

export const TRAFFIC_THRESHOLDS = {
  WARNING_CPA_NM: 1.0,
  WARNING_TCPA_MIN: 15,
  DANGER_CPA_NM: 0.5,
  DANGER_TCPA_MIN: 10,
};

// ─── CPA Calculation (from trafficManager.mjs) ─────────────────────────────

export function calculateCPATCPA(own, target) {
  const dLat = (target.lat - own.lat) * DEG_TO_RAD;
  const dLon = (target.lon - own.lon) * DEG_TO_RAD;
  const midLat = ((own.lat + target.lat) / 2) * DEG_TO_RAD;

  const relX = (dLon * Math.cos(midLat) * EARTH_RADIUS_M) / NM_TO_M;
  const relY = (dLat * EARTH_RADIUS_M) / NM_TO_M;

  const ownVx = own.sog * Math.sin(own.cog * DEG_TO_RAD);
  const ownVy = own.sog * Math.cos(own.cog * DEG_TO_RAD);
  const targetVx = target.sog * Math.sin(target.cog * DEG_TO_RAD);
  const targetVy = target.sog * Math.cos(target.cog * DEG_TO_RAD);

  const relVx = targetVx - ownVx;
  const relVy = targetVy - ownVy;
  const relSpeedSq = relVx * relVx + relVy * relVy;

  if (relSpeedSq < 1e-10) {
    const currentDist = Math.sqrt(relX * relX + relY * relY);
    return { cpa: currentDist, tcpa: Infinity };
  }

  const tcpaHours = -(relX * relVx + relY * relVy) / relSpeedSq;
  const tcpaMinutes = tcpaHours * 60;

  const cpaX = relX + relVx * tcpaHours;
  const cpaY = relY + relVy * tcpaHours;
  const cpa = Math.sqrt(cpaX * cpaX + cpaY * cpaY);

  return { cpa, tcpa: tcpaMinutes };
}

export function classifyRisk(cpa, tcpa) {
  if (tcpa <= 0 || !Number.isFinite(tcpa)) return 'SAFE';
  if (cpa < TRAFFIC_THRESHOLDS.DANGER_CPA_NM && tcpa < TRAFFIC_THRESHOLDS.DANGER_TCPA_MIN) return 'DANGER';
  if (cpa < TRAFFIC_THRESHOLDS.WARNING_CPA_NM && tcpa < TRAFFIC_THRESHOLDS.WARNING_TCPA_MIN) return 'WARNING';
  return 'SAFE';
}

// ─── Utility ────────────────────────────────────────────────────────────────

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function movePosition(lat, lon, headingDeg, distanceNm) {
  const d = (distanceNm * NM_TO_M) / EARTH_RADIUS_M;
  const brng = headingDeg * DEG_TO_RAD;
  const lat1 = lat * DEG_TO_RAD;
  const lon1 = lon * DEG_TO_RAD;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  return { lat: lat2 * RAD_TO_DEG, lon: lon2 * RAD_TO_DEG };
}

// ─── Simulator Class ────────────────────────────────────────────────────────

export class VesselSimulator {
  constructor() {
    this.startTime = Date.now();
    this.tick = 0;

    // Own vessel — starting in the Solent, heading south-east
    this.ownVessel = {
      lat: 50.75,
      lon: -1.3,
      sog: 6.5,
      cog: 135,
    };

    // Route history
    this.routeHistory = [{ lat: this.ownVessel.lat, lon: this.ownVessel.lon }];

    // Engine state
    this.engine = {
      rpm: 2300,
      coolantTemp: 81,
      oilPressure: 3.0,
      hours: 1247.3,
      healthScore: 94,
    };

    // Power state
    this.power = {
      socPercent: 85,
      voltage: 13.2,
      solarWatts: 280,
      windWatts: 45,
      consumptionWatts: 180,
    };

    // Navigation
    this.navigation = {
      depth: 15.0,
      windSpeed: 14,
      windAngle: 45,
    };

    // Temperature (cabin)
    this.cabinTemp = 25.0;

    // AIS targets
    this.aisTargets = [
      {
        mmsi: 235092410,
        name: 'RED FALCON',
        lat: 50.74,
        lon: -1.28,
        sog: 12.0,
        cog: 180,
        length: 58,
        type: 'ferry',
      },
      {
        mmsi: 235001234,
        name: 'OCEAN SPIRIT',
        lat: 50.76,
        lon: -1.25,
        sog: 4.0,
        cog: 270,
        length: 12,
        type: 'yacht',
      },
      {
        mmsi: 235005678,
        name: 'SOLENT TRADER',
        lat: 50.73,
        lon: -1.32,
        sog: 8.5,
        cog: 90,
        length: 85,
        type: 'cargo',
      },
      {
        mmsi: 235009999,
        name: 'HAMBLE STAR',
        lat: 50.77,
        lon: -1.27,
        sog: 5.0,
        cog: 200,
        length: 15,
        type: 'yacht',
      },
    ];

    // Tanks
    this.tanks = {
      fuel: 78,
      water: 65,
      waste: 22,
    };

    // Alarms history
    this.alarms = [];
  }

  /**
   * Get elapsed seconds since start
   */
  getElapsedSeconds() {
    return (Date.now() - this.startTime) / 1000;
  }

  /**
   * Advance simulation by one tick (~1.5 seconds)
   */
  update() {
    this.tick++;
    const elapsed = this.getElapsedSeconds();

    this._updateOwnVessel();
    this._updateEngine();
    this._updatePower(elapsed);
    this._updateNavigation(elapsed);
    this._updateCabinTemp(elapsed);
    this._updateAISTargets(elapsed);
    this._updateTanks();
    this._checkAlarms(elapsed);

    return this.getState();
  }

  /**
   * Get current full state snapshot
   */
  getState() {
    const elapsed = this.getElapsedSeconds();

    // Calculate CPA for all AIS targets
    const aisWithCPA = this.aisTargets.map((target) => {
      const { cpa, tcpa } = calculateCPATCPA(this.ownVessel, target);
      const risk = classifyRisk(cpa, tcpa);
      return { ...target, cpa: +cpa.toFixed(2), tcpa: +tcpa.toFixed(1), risk };
    });

    return {
      timestamp: Date.now(),
      elapsed: +elapsed.toFixed(1),
      ownVessel: { ...this.ownVessel },
      routeHistory: [...this.routeHistory],
      engine: { ...this.engine },
      power: { ...this.power },
      navigation: { ...this.navigation },
      cabinTemp: +this.cabinTemp.toFixed(1),
      aisTargets: aisWithCPA,
      tanks: { ...this.tanks },
      alarms: [...this.alarms],
    };
  }

  // ─── Private Update Methods ─────────────────────────────────────────────

  _updateOwnVessel() {
    // Move vessel along heading at current SOG
    // Distance per tick (~1.5s) in nautical miles
    const timeHours = 1.5 / 3600;
    const distNm = this.ownVessel.sog * timeHours;

    // Slight random course variation
    this.ownVessel.cog += randomBetween(-0.5, 0.5);
    this.ownVessel.cog = ((this.ownVessel.cog % 360) + 360) % 360;

    // Slight speed variation
    this.ownVessel.sog = Math.max(5, Math.min(8, this.ownVessel.sog + randomBetween(-0.1, 0.1)));

    const newPos = movePosition(
      this.ownVessel.lat,
      this.ownVessel.lon,
      this.ownVessel.cog,
      distNm
    );
    this.ownVessel.lat = newPos.lat;
    this.ownVessel.lon = newPos.lon;

    // Record route (every 5 ticks)
    if (this.tick % 5 === 0) {
      this.routeHistory.push({ lat: newPos.lat, lon: newPos.lon });
      if (this.routeHistory.length > 200) this.routeHistory.shift();
    }
  }

  _updateEngine() {
    this.engine.rpm = Math.round(
      Math.max(2000, Math.min(2600, this.engine.rpm + randomBetween(-30, 30)))
    );
    this.engine.coolantTemp = +(
      Math.max(78, Math.min(85, this.engine.coolantTemp + randomBetween(-0.3, 0.3)))
    ).toFixed(1);
    this.engine.oilPressure = +(
      Math.max(2.5, Math.min(3.5, this.engine.oilPressure + randomBetween(-0.05, 0.05)))
    ).toFixed(2);
    this.engine.hours += 1.5 / 3600;
    this.engine.hours = +this.engine.hours.toFixed(1);

    // Health score fluctuates slightly
    this.engine.healthScore = Math.round(
      Math.max(88, Math.min(98, this.engine.healthScore + randomBetween(-0.5, 0.5)))
    );
  }

  _updatePower(elapsed) {
    // Battery SOC slowly drains from 85% to ~45% over 5 minutes (300s)
    const drainRate = (85 - 45) / 300; // percent per second
    this.power.socPercent = Math.max(45, 85 - elapsed * drainRate);
    this.power.socPercent = +this.power.socPercent.toFixed(1);

    // Voltage correlates with SOC
    this.power.voltage = +(12.0 + (this.power.socPercent / 100) * 1.6).toFixed(1);

    // Solar fluctuates 100-400W
    this.power.solarWatts = Math.round(
      Math.max(100, Math.min(400, this.power.solarWatts + randomBetween(-15, 15)))
    );

    // Wind generation 20-80W
    this.power.windWatts = Math.round(
      Math.max(20, Math.min(80, this.power.windWatts + randomBetween(-5, 5)))
    );

    // Consumption 150-220W
    this.power.consumptionWatts = Math.round(
      Math.max(150, Math.min(220, this.power.consumptionWatts + randomBetween(-5, 5)))
    );
  }

  _updateNavigation(elapsed) {
    // Normal depth varies 5-25m
    let baseDepth = 12 + Math.sin(elapsed / 30) * 8;

    // At ~90 seconds: depth drops sharply to trigger alarm
    if (elapsed >= 85 && elapsed <= 100) {
      const progress = (elapsed - 85) / 7.5;
      baseDepth = 12 - progress * 10; // Drop to ~2m
      baseDepth = Math.max(2.0, baseDepth);
    } else if (elapsed > 100 && elapsed < 110) {
      // Recovery
      baseDepth = 2.0 + ((elapsed - 100) / 10) * 10;
    }

    this.navigation.depth = +(Math.max(2.0, baseDepth + randomBetween(-0.3, 0.3))).toFixed(1);

    // Wind
    this.navigation.windSpeed = +(
      Math.max(10, Math.min(20, this.navigation.windSpeed + randomBetween(-0.5, 0.5)))
    ).toFixed(0);
    this.navigation.windAngle = Math.round(
      Math.max(0, Math.min(180, this.navigation.windAngle + randomBetween(-3, 3)))
    );
  }

  _updateCabinTemp(elapsed) {
    // Normal range: 24-27°C
    let targetTemp = 25.5 + Math.sin(elapsed / 60) * 1.5;

    // At ~30 seconds: spike to 29°C to trigger pug warning
    if (elapsed >= 25 && elapsed <= 45) {
      const progress = Math.min(1, (elapsed - 25) / 5);
      targetTemp = 25.5 + progress * 3.5; // Spike to 29°C
    }

    // At ~150 seconds: normalise
    if (elapsed >= 145) {
      targetTemp = 25.0;
    }

    // Smooth approach to target
    this.cabinTemp += (targetTemp - this.cabinTemp) * 0.15;
    this.cabinTemp += randomBetween(-0.1, 0.1);
    this.cabinTemp = +this.cabinTemp.toFixed(1);
  }

  _updateAISTargets(elapsed) {
    // Move all AIS targets
    for (const target of this.aisTargets) {
      const timeHours = 1.5 / 3600;
      const distNm = target.sog * timeHours;

      // Special behaviour for SOLENT TRADER — collision course scenario
      if (target.mmsi === 235005678) {
        // At ~50s start converging on own vessel
        if (elapsed >= 50 && elapsed <= 130) {
          // Calculate bearing to own vessel
          const dLat = this.ownVessel.lat - target.lat;
          const dLon = this.ownVessel.lon - target.lon;
          const bearing =
            (Math.atan2(dLon * Math.cos(target.lat * DEG_TO_RAD), dLat) * RAD_TO_DEG + 360) % 360;
          // Gradually steer towards own vessel
          const convergeFactor = Math.min(1, (elapsed - 50) / 30);
          target.cog = target.cog + (bearing - target.cog) * convergeFactor * 0.1;
          target.sog = 10 + convergeFactor * 4; // Speed up
        }
        // After 130s, turn away
        if (elapsed > 130) {
          target.cog = (target.cog + 2) % 360; // Turn away
          target.sog = Math.max(8, target.sog - 0.1);
        }
      }

      // Small random heading variation for others
      if (target.mmsi !== 235005678) {
        target.cog += randomBetween(-0.3, 0.3);
        target.cog = ((target.cog % 360) + 360) % 360;
      }

      const newPos = movePosition(target.lat, target.lon, target.cog, distNm);
      target.lat = newPos.lat;
      target.lon = newPos.lon;
    }
  }

  _updateTanks() {
    // Very slow decrease
    this.tanks.fuel = +(Math.max(50, this.tanks.fuel - 0.01)).toFixed(1);
    this.tanks.water = +(Math.max(40, this.tanks.water - 0.005)).toFixed(1);
    this.tanks.waste = +(Math.min(40, this.tanks.waste + 0.003)).toFixed(1);
  }

  _checkAlarms(elapsed) {
    // Clear old resolved alarms
    const activeAlarms = this.alarms.filter((a) => !a.resolved);

    // Pug temperature warning at ~30s
    if (elapsed >= 30 && elapsed < 45 && this.cabinTemp >= PUG_THRESHOLDS.WARNING_C) {
      if (!this.alarms.find((a) => a.id === 'pug-temp-warning' && !a.resolved)) {
        this.alarms.push({
          id: 'pug-temp-warning',
          level: 'WARNING',
          category: 'safety',
          title: 'Pug Temperature Warning',
          message: `Cabin temperature ${this.cabinTemp.toFixed(1)}°C exceeds ${PUG_THRESHOLDS.WARNING_C}°C — increasing ventilation`,
          timestamp: Date.now(),
          resolved: false,
        });
      }
    }

    // Collision WARNING at ~60s
    if (elapsed >= 55 && elapsed < 90) {
      const trader = this.aisTargets.find((t) => t.mmsi === 235005678);
      if (trader) {
        const { cpa, tcpa } = calculateCPATCPA(this.ownVessel, trader);
        if (cpa < TRAFFIC_THRESHOLDS.WARNING_CPA_NM && tcpa > 0 && tcpa < TRAFFIC_THRESHOLDS.WARNING_TCPA_MIN) {
          if (!this.alarms.find((a) => a.id === 'collision-warning' && !a.resolved)) {
            this.alarms.push({
              id: 'collision-warning',
              level: 'WARNING',
              category: 'traffic',
              title: 'Collision Risk — SOLENT TRADER',
              message: `CPA ${cpa.toFixed(2)}nm in ${tcpa.toFixed(0)} minutes — monitoring`,
              timestamp: Date.now(),
              resolved: false,
            });
          }
        }
      }
    }

    // Shallow water CRITICAL at ~90s
    if (elapsed >= 88 && elapsed < 105) {
      const depthBelowKeel = this.navigation.depth - DEPTH_THRESHOLDS.DRAFT;
      if (depthBelowKeel < DEPTH_THRESHOLDS.SAFETY_MARGIN) {
        if (!this.alarms.find((a) => a.id === 'shallow-water' && !a.resolved)) {
          this.alarms.push({
            id: 'shallow-water',
            level: 'CRITICAL',
            category: 'navigation',
            title: 'Shallow Water — DANGER',
            message: `Depth ${this.navigation.depth.toFixed(1)}m — under-keel clearance ${depthBelowKeel.toFixed(1)}m below safety margin!`,
            timestamp: Date.now(),
            resolved: false,
          });
        }
      }
    }

    // Collision DANGER at ~120s
    if (elapsed >= 115 && elapsed < 135) {
      const trader = this.aisTargets.find((t) => t.mmsi === 235005678);
      if (trader) {
        const { cpa, tcpa } = calculateCPATCPA(this.ownVessel, trader);
        if (cpa < TRAFFIC_THRESHOLDS.DANGER_CPA_NM && tcpa > 0 && tcpa < TRAFFIC_THRESHOLDS.DANGER_TCPA_MIN) {
          if (!this.alarms.find((a) => a.id === 'collision-danger' && !a.resolved)) {
            // Resolve the warning first
            const warningAlarm = this.alarms.find((a) => a.id === 'collision-warning' && !a.resolved);
            if (warningAlarm) warningAlarm.resolved = true;

            this.alarms.push({
              id: 'collision-danger',
              level: 'CRITICAL',
              category: 'traffic',
              title: 'COLLISION DANGER — SOLENT TRADER',
              message: `CPA ${cpa.toFixed(2)}nm in ${tcpa.toFixed(0)} minutes — alter course to starboard NOW`,
              timestamp: Date.now(),
              resolved: false,
            });
          }
        }
      }
    }

    // At ~150s resolve everything
    if (elapsed >= 150) {
      for (const alarm of this.alarms) {
        if (!alarm.resolved) {
          alarm.resolved = true;
          alarm.resolvedAt = Date.now();
        }
      }
    }
  }
}
