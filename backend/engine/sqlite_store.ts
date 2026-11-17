import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = process.env.SQLITE_DB_PATH
  ? path.resolve(process.env.SQLITE_DB_PATH)
  : path.join(DEFAULT_DB_DIR, 'projectile_lab.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new DatabaseSync(DB_PATH);
sqlite.exec('PRAGMA journal_mode = WAL;');
sqlite.exec('PRAGMA foreign_keys = ON;');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firebase_uid TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    profile_image TEXT,
    theme_preference TEXT NOT NULL DEFAULT 'dark',
    audio_enabled INTEGER NOT NULL DEFAULT 1,
    audio_volume REAL NOT NULL DEFAULT 0.45,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS simulations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    simulation_name TEXT NOT NULL,
    projectile_type TEXT NOT NULL,
    physics_model TEXT NOT NULL,
    source_environment TEXT NOT NULL,
    destination_environment TEXT NOT NULL,
    environment_time TEXT NOT NULL DEFAULT 'day',
    environment_weather TEXT NOT NULL DEFAULT 'clear',
    initial_velocity REAL NOT NULL,
    launch_angle REAL NOT NULL,
    gravity REAL NOT NULL,
    time_step REAL NOT NULL,
    mass REAL NOT NULL,
    drag_coefficient REAL NOT NULL,
    air_density REAL NOT NULL,
    cross_sectional_area REAL NOT NULL,
    maximum_height REAL NOT NULL,
    flight_time REAL NOT NULL,
    horizontal_range REAL NOT NULL,
    final_velocity REAL NOT NULL,
    max_speed REAL NOT NULL DEFAULT 0,
    step_count INTEGER NOT NULL DEFAULT 0,
    destination_reached INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS ix_simulations_user_created ON simulations(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS simulation_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    simulation_id INTEGER NOT NULL,
    iteration_number INTEGER NOT NULL,
    time REAL NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    vx REAL NOT NULL,
    vy REAL NOT NULL,
    speed REAL NOT NULL DEFAULT 0,
    k1 TEXT NOT NULL,
    k2 TEXT NOT NULL,
    k3 TEXT NOT NULL,
    k4 TEXT NOT NULL,
    next_state TEXT NOT NULL,
    analytical TEXT,
    position_error REAL,
    velocity_error REAL,
    FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS ix_sim_step_sim_iter ON simulation_steps(simulation_id, iteration_number);

  CREATE TABLE IF NOT EXISTS simulation_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    simulation_id INTEGER NOT NULL UNIQUE,
    initial_height REAL NOT NULL DEFAULT 0,
    destination_distance REAL,
    destination_height REAL NOT NULL DEFAULT 0,
    destination_tolerance REAL NOT NULL DEFAULT 5,
    destination_delta REAL,
    y_at_destination REAL,
    analytical_summary TEXT,
    errors_summary TEXT,
    extra_params TEXT,
    FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE
  );
`);

export interface SqliteUserRow {
  id: number;
  firebase_uid: string;
  email: string;
  display_name: string;
  profile_image: string | null;
  theme_preference: 'light' | 'dark';
  audio_enabled: boolean;
  audio_volume: number;
  created_at: string;
}

export function getSqliteDbPath(): string {
  return DB_PATH;
}

export function syncSqliteUser(params: {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
}): SqliteUserRow {
  const existing = sqlite
    .prepare('SELECT * FROM users WHERE firebase_uid = ?')
    .get(params.uid) as Record<string, unknown> | undefined;

  if (!existing) {
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO users (firebase_uid, email, display_name, profile_image, theme_preference, audio_enabled, audio_volume, created_at)
         VALUES (?, ?, ?, ?, 'dark', 1, 0.45, ?)`,
      )
      .run(
        params.uid,
        params.email.slice(0, 255),
        params.displayName.slice(0, 150) || 'Researcher',
        params.photoURL ? params.photoURL.slice(0, 250000) : null,
        now,
      );
  } else if (params.email || params.photoURL) {
    sqlite
      .prepare(
        `UPDATE users SET email = COALESCE(NULLIF(?, ''), email), profile_image = COALESCE(profile_image, ?)
         WHERE firebase_uid = ?`,
      )
      .run(
        params.email.slice(0, 255),
        params.photoURL ? params.photoURL.slice(0, 250000) : null,
        params.uid,
      );
  }

  const row = sqlite
    .prepare('SELECT * FROM users WHERE firebase_uid = ?')
    .get(params.uid) as Record<string, unknown>;

  return {
    id: Number(row.id),
    firebase_uid: String(row.firebase_uid),
    email: String(row.email),
    display_name: String(row.display_name),
    profile_image: row.profile_image ? String(row.profile_image) : null,
    theme_preference: row.theme_preference === 'dark' ? 'dark' : 'light',
    audio_enabled: Number(row.audio_enabled) === 1,
    audio_volume: Number(row.audio_volume ?? 0.45),
    created_at: String(row.created_at),
  };
}

export function updateSqliteUserPreferences(
  uid: string,
  prefs: {
    displayName?: string;
    photoURL?: string | null;
    themePreference?: 'light' | 'dark';
    audioEnabled?: boolean;
    audioVolume?: number;
  },
): SqliteUserRow {
  const current = sqlite
    .prepare('SELECT * FROM users WHERE firebase_uid = ?')
    .get(uid) as Record<string, unknown> | undefined;

  if (!current) {
    return syncSqliteUser({
      uid,
      email: '',
      displayName: prefs.displayName || 'Researcher',
      photoURL: prefs.photoURL ?? null,
    });
  }

  const nextName =
    prefs.displayName !== undefined && prefs.displayName.trim()
      ? prefs.displayName.trim().slice(0, 150)
      : String(current.display_name);
  const nextPhoto =
    prefs.photoURL !== undefined
      ? prefs.photoURL
        ? String(prefs.photoURL).slice(0, 250000)
        : null
      : current.profile_image
        ? String(current.profile_image)
        : null;
  const nextTheme =
    prefs.themePreference === 'dark' || prefs.themePreference === 'light'
      ? prefs.themePreference
      : current.theme_preference === 'dark'
        ? 'dark'
        : 'light';
  const nextAudio =
    typeof prefs.audioEnabled === 'boolean'
      ? prefs.audioEnabled
        ? 1
        : 0
      : Number(current.audio_enabled ?? 1);
  const nextVol =
    typeof prefs.audioVolume === 'number'
      ? Math.max(0, Math.min(1, prefs.audioVolume))
      : Number(current.audio_volume ?? 0.45);

  sqlite
    .prepare(
      `UPDATE users
       SET display_name = ?, profile_image = ?, theme_preference = ?, audio_enabled = ?, audio_volume = ?
       WHERE firebase_uid = ?`,
    )
    .run(nextName, nextPhoto, nextTheme, nextAudio, nextVol, uid);

  return syncSqliteUser({ uid, email: String(current.email), displayName: nextName });
}

export function saveSqliteSimulation(
  uid: string,
  email: string,
  displayName: string,
  config: Record<string, unknown>,
  output: Record<string, unknown>,
): string {
  const user = syncSqliteUser({ uid, email, displayName });
  const summary = (output.summary ?? {}) as Record<string, unknown>;
  const steps = Array.isArray(output.steps) ? (output.steps as Record<string, unknown>[]) : [];
  const now = new Date().toISOString();

  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const destReachedRaw = summary.destination_reached;
    const destReachedInt =
      destReachedRaw === null || destReachedRaw === undefined ? null : destReachedRaw ? 1 : 0;

    const simResult = sqlite
      .prepare(
        `INSERT INTO simulations (
          user_id, simulation_name, projectile_type, physics_model,
          source_environment, destination_environment, environment_time, environment_weather,
          initial_velocity, launch_angle, gravity, time_step, mass,
          drag_coefficient, air_density, cross_sectional_area,
          maximum_height, flight_time, horizontal_range, final_velocity, max_speed,
          step_count, destination_reached, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        user.id,
        String(config.simulationName || 'Untitled Trajectory').slice(0, 200),
        String(config.projectileType || 'ball'),
        String(config.physicsModel || 'ideal'),
        String(config.sourceEnvironment || 'open_field').slice(0, 64),
        String(config.destinationEnvironment || 'open_field').slice(0, 64),
        String(config.environmentTime || 'day'),
        String(config.environmentWeather || 'clear'),
        Number(config.initialVelocity ?? 50),
        Number(config.launchAngleDeg ?? 45),
        Number(config.gravity ?? 9.81),
        Number(config.timeStep ?? 0.05),
        Number(config.mass ?? 0.45),
        Number(config.dragCoefficient ?? 0.47),
        Number(config.airDensity ?? 1.225),
        Number(config.crossSectionalArea ?? 0.038),
        Number(summary.maximum_height ?? 0),
        Number(summary.flight_time ?? 0),
        Number(summary.horizontal_range ?? 0),
        Number(summary.final_velocity ?? 0),
        Number(summary.max_speed ?? 0),
        steps.length,
        destReachedInt,
        now,
      );

    const simulationId = Number(simResult.lastInsertRowid);

    sqlite
      .prepare(
        `INSERT INTO simulation_metadata (
          simulation_id, initial_height, destination_distance, destination_height,
          destination_tolerance, destination_delta, y_at_destination,
          analytical_summary, errors_summary, extra_params
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        simulationId,
        Number(config.initialHeight ?? 0),
        config.destinationDistance === null || config.destinationDistance === undefined
          ? null
          : Number(config.destinationDistance),
        Number(config.destinationHeight ?? 0),
        Number(config.destinationTolerance ?? 5),
        summary.destination_delta === null || summary.destination_delta === undefined
          ? null
          : Number(summary.destination_delta),
        summary.y_at_destination === null || summary.y_at_destination === undefined
          ? null
          : Number(summary.y_at_destination),
        output.analytical ? JSON.stringify(output.analytical) : null,
        output.errors ? JSON.stringify(output.errors) : null,
        JSON.stringify({
          thrust: Number(config.thrust ?? 0),
          burnTime: Number(config.burnTime ?? 0),
          dryMass: Number(config.dryMass ?? config.mass ?? 0.45),
          liftCoefficient: Number(config.liftCoefficient ?? 0),
          wingArea: Number(config.wingArea ?? 0),
        }),
      );

    const insertStep = sqlite.prepare(
      `INSERT INTO simulation_steps (
        simulation_id, iteration_number, time, x, y, vx, vy, speed,
        k1, k2, k3, k4, next_state, analytical, position_error, velocity_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const st of steps) {
      insertStep.run(
        simulationId,
        Number(st.iteration ?? 0),
        Number(st.t ?? 0),
        Number(st.x ?? 0),
        Number(st.y ?? 0),
        Number(st.vx ?? 0),
        Number(st.vy ?? 0),
        Number(st.speed ?? 0),
        JSON.stringify(st.k1 ?? [0, 0, 0, 0]),
        JSON.stringify(st.k2 ?? [0, 0, 0, 0]),
        JSON.stringify(st.k3 ?? [0, 0, 0, 0]),
        JSON.stringify(st.k4 ?? [0, 0, 0, 0]),
        JSON.stringify(st.next_state ?? [0, 0, 0, 0]),
        st.analytical ? JSON.stringify(st.analytical) : null,
        st.position_error === undefined || st.position_error === null
          ? null
          : Number(st.position_error),
        st.velocity_error === undefined || st.velocity_error === null
          ? null
          : Number(st.velocity_error),
      );
    }

    sqlite.exec('COMMIT');
    return String(simulationId);
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  }
}

export function listSqliteSimulations(uid: string) {
  const rows = sqlite
    .prepare(
      `SELECT s.*, u.firebase_uid AS uid,
              m.initial_height, m.destination_distance, m.destination_height,
              m.destination_tolerance, m.destination_delta, m.y_at_destination,
              m.analytical_summary, m.errors_summary, m.extra_params
       FROM simulations s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN simulation_metadata m ON m.simulation_id = s.id
       WHERE u.firebase_uid = ?
       ORDER BY s.created_at DESC`,
    )
    .all(uid) as Record<string, unknown>[];

  return rows.map((r) => {
    const extra = r.extra_params ? (JSON.parse(String(r.extra_params)) as Record<string, unknown>) : {};
    return {
      id: String(r.id),
      uid: String(r.uid),
      simulationName: String(r.simulation_name),
      projectileType: String(r.projectile_type),
      physicsModel: String(r.physics_model),
      sourceEnvironment: String(r.source_environment),
      destinationEnvironment: String(r.destination_environment),
      environmentTime: String(r.environment_time || 'day'),
      environmentWeather: String(r.environment_weather || 'clear'),
      initialVelocity: Number(r.initial_velocity),
      launchAngleDeg: Number(r.launch_angle),
      gravity: Number(r.gravity),
      timeStep: Number(r.time_step),
      initialHeight: Number(r.initial_height ?? 0),
      mass: Number(r.mass),
      airDensity: Number(r.air_density),
      dragCoefficient: Number(r.drag_coefficient),
      crossSectionalArea: Number(r.cross_sectional_area),
      thrust: Number(extra.thrust ?? 0),
      burnTime: Number(extra.burnTime ?? 0),
      dryMass: Number(extra.dryMass ?? r.mass),
      liftCoefficient: Number(extra.liftCoefficient ?? 0),
      wingArea: Number(extra.wingArea ?? 0),
      destinationDistance:
        r.destination_distance === null || r.destination_distance === undefined
          ? null
          : Number(r.destination_distance),
      destinationHeight: Number(r.destination_height ?? 0),
      destinationTolerance: Number(r.destination_tolerance ?? 5),
      maximumHeight: Number(r.maximum_height),
      flightTime: Number(r.flight_time),
      horizontalRange: Number(r.horizontal_range),
      finalVelocity: Number(r.final_velocity),
      maxSpeed: Number(r.max_speed ?? r.final_velocity),
      stepCount: Number(r.step_count ?? 0),
      destinationReached:
        r.destination_reached === null || r.destination_reached === undefined
          ? null
          : Number(r.destination_reached) === 1,
      destinationDelta:
        r.destination_delta === null || r.destination_delta === undefined
          ? null
          : Number(r.destination_delta),
      yAtDestination:
        r.y_at_destination === null || r.y_at_destination === undefined
          ? null
          : Number(r.y_at_destination),
      analyticalSummary: r.analytical_summary ? JSON.parse(String(r.analytical_summary)) : null,
      errorsSummary: r.errors_summary ? JSON.parse(String(r.errors_summary)) : null,
      createdAt: String(r.created_at),
    };
  });
}

export function getSqliteSimulationSteps(uid: string, simId: string) {
  const numericId = Number(simId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new Error('Invalid simulation identifier.');
  }

  const ownerRow = sqlite
    .prepare(
      `SELECT s.id FROM simulations s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND u.firebase_uid = ?`,
    )
    .get(numericId, uid);

  if (!ownerRow) {
    throw new Error('Simulation not found or access denied.');
  }

  const rows = sqlite
    .prepare(
      `SELECT * FROM simulation_steps
       WHERE simulation_id = ?
       ORDER BY iteration_number ASC`,
    )
    .all(numericId) as Record<string, unknown>[];

  return rows.map((r) => ({
    iteration: Number(r.iteration_number),
    t: Number(r.time),
    x: Number(r.x),
    y: Number(r.y),
    vx: Number(r.vx),
    vy: Number(r.vy),
    speed: Number(r.speed),
    k1: JSON.parse(String(r.k1)),
    k2: JSON.parse(String(r.k2)),
    k3: JSON.parse(String(r.k3)),
    k4: JSON.parse(String(r.k4)),
    next_state: JSON.parse(String(r.next_state)),
    ...(r.analytical ? { analytical: JSON.parse(String(r.analytical)) } : {}),
    ...(r.position_error !== null && r.position_error !== undefined
      ? { position_error: Number(r.position_error) }
      : {}),
    ...(r.velocity_error !== null && r.velocity_error !== undefined
      ? { velocity_error: Number(r.velocity_error) }
      : {}),
  }));
}

export function deleteSqliteSimulation(uid: string, simId: string): boolean {
  const numericId = Number(simId);
  if (!Number.isInteger(numericId) || numericId <= 0) return false;

  const ownerRow = sqlite
    .prepare(
      `SELECT s.id FROM simulations s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND u.firebase_uid = ?`,
    )
    .get(numericId, uid);

  if (!ownerRow) return false;

  sqlite.prepare('DELETE FROM simulations WHERE id = ?').run(numericId);
  return true;
}

export function getUserDatabaseSnapshot(uid: string) {
  const user = sqlite
    .prepare('SELECT id, firebase_uid, email, display_name, theme_preference, created_at FROM users WHERE firebase_uid = ?')
    .get(uid) as Record<string, unknown> | undefined;

  const sims = listSqliteSimulations(uid);
  const stepTotalRow = sqlite
    .prepare(
      `SELECT COUNT(*) AS cnt FROM simulation_steps st
       JOIN simulations s ON s.id = st.simulation_id
       JOIN users u ON u.id = s.user_id
       WHERE u.firebase_uid = ?`,
    )
    .get(uid) as { cnt: number };

  return {
    engine: 'SQLite (WAL Mode)',
    dbFile: 'data/projectile_lab.db',
    tables: ['users', 'simulations', 'simulation_steps', 'simulation_metadata'],
    user: user ?? null,
    simulationCount: sims.length,
    totalStoredSteps: Number(stepTotalRow?.cnt ?? 0),
    simulations: sims,
  };
}
