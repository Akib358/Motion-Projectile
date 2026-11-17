import { auth } from '../lib/firebase';
import {
  deleteSimulationFromFirestore,
  listSimulationsFromFirestore,
  loadSimulationStepsFromFirestore,
  saveSimulationToFirestore,
} from './firestoreSyncService';
import {
  ConvergenceOutput,
  RK4Step,
  SavedSimulationRecord,
  SimulationConfig,
  SimulationOutput,
} from '../types/simulation';

function toSnakeCasePayload(config: SimulationConfig) {
  return {
    simulation_name: config.simulationName,
    projectile_type: config.projectileType,
    physics_model: config.physicsModel,
    source_environment: config.sourceEnvironment,
    destination_environment: config.destinationEnvironment,
    initial_velocity: config.initialVelocity,
    launch_angle_deg: config.launchAngleDeg,
    gravity: config.gravity,
    time_step: config.timeStep,
    initial_height: config.initialHeight,
    mass: config.mass,
    air_density: config.airDensity,
    drag_coefficient: config.dragCoefficient,
    cross_sectional_area: config.crossSectionalArea,
    thrust: config.thrust,
    burn_time: config.burnTime,
    dry_mass: config.dryMass,
    lift_coefficient: config.liftCoefficient,
    wing_area: config.wingArea,
    destination_distance: config.destinationDistance,
    destination_height: config.destinationHeight,
    destination_tolerance: config.destinationTolerance,
  };
}

export async function computeSimulationApi(
  config: SimulationConfig,
  idToken: string,
): Promise<SimulationOutput> {
  const response = await fetch('/api/simulations/compute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(toSnakeCasePayload(config)),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: 'Simulation request failed.' }));
    throw new Error(errBody.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function computeConvergenceApi(
  config: SimulationConfig,
  idToken: string,
): Promise<ConvergenceOutput> {
  const response = await fetch('/api/simulations/convergence', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(toSnakeCasePayload(config)),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: 'Convergence request failed.' }));
    throw new Error(errBody.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function saveSimulationToDatabase(
  idToken: string,
  config: SimulationConfig,
  output: SimulationOutput,
): Promise<string> {
  const response = await fetch('/api/simulations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ config, output }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: 'Failed to save simulation to SQLite.' }));
    throw new Error(errBody.error || `HTTP ${response.status}`);
  }
  const data = await response.json();
  const sqliteId = String(data.id);

  if (auth.currentUser) {
    await saveSimulationToFirestore(auth.currentUser.uid, sqliteId, config, output);
  }

  return sqliteId;
}

export async function listUserSimulations(idToken: string): Promise<SavedSimulationRecord[]> {
  const response = await fetch('/api/simulations', {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: 'Failed to load simulation history.' }));
    throw new Error(errBody.error || `HTTP ${response.status}`);
  }
  const sqliteItems: SavedSimulationRecord[] = await response.json();

  if (!auth.currentUser) {
    return sqliteItems;
  }

  const firestoreItems = await listSimulationsFromFirestore(auth.currentUser.uid);
  const byId = new Map<string, SavedSimulationRecord>();
  for (const item of firestoreItems) {
    byId.set(item.id, item);
  }
  for (const item of sqliteItems) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadSimulationSteps(idToken: string, simId: string): Promise<RK4Step[]> {
  const response = await fetch(`/api/simulations/${encodeURIComponent(simId)}/steps`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  if (response.ok) {
    const sqliteSteps: RK4Step[] = await response.json();
    if (sqliteSteps.length > 0 || !auth.currentUser) {
      return sqliteSteps;
    }
  } else if (response.status !== 404 || !auth.currentUser) {
    const errBody = await response.json().catch(() => ({ error: 'Failed to load RK4 steps.' }));
    throw new Error(errBody.error || `HTTP ${response.status}`);
  }

  if (auth.currentUser) {
    return loadSimulationStepsFromFirestore(auth.currentUser.uid, simId);
  }
  return [];
}

export async function deleteUserSimulation(idToken: string, simId: string): Promise<void> {
  const response = await fetch(`/api/simulations/${encodeURIComponent(simId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  if (!response.ok && response.status !== 404) {
    const errBody = await response.json().catch(() => ({ error: 'Failed to delete simulation.' }));
    throw new Error(errBody.error || `HTTP ${response.status}`);
  }
  if (auth.currentUser) {
    await deleteSimulationFromFirestore(auth.currentUser.uid, simId);
  }
}

