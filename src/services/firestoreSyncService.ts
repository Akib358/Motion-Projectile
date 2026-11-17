import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  RK4Step,
  SavedSimulationRecord,
  SimulationConfig,
  SimulationOutput,
} from '../types/simulation';

function sanitizeStep(step: RK4Step): RK4Step {
  const clean: RK4Step = {
    iteration: Number(step.iteration),
    t: Number(step.t),
    x: Number(step.x),
    y: Number(step.y),
    vx: Number(step.vx),
    vy: Number(step.vy),
    speed: Number(step.speed),
    k1: [...step.k1] as [number, number, number, number],
    k2: [...step.k2] as [number, number, number, number],
    k3: [...step.k3] as [number, number, number, number],
    k4: [...step.k4] as [number, number, number, number],
    next_state: [...step.next_state] as [number, number, number, number],
  };
  if (step.analytical) {
    clean.analytical = {
      x: Number(step.analytical.x),
      y: Number(step.analytical.y),
      vx: Number(step.analytical.vx),
      vy: Number(step.analytical.vy),
    };
  }
  if (typeof step.position_error === 'number' && Number.isFinite(step.position_error)) {
    clean.position_error = step.position_error;
  }
  if (typeof step.velocity_error === 'number' && Number.isFinite(step.velocity_error)) {
    clean.velocity_error = step.velocity_error;
  }
  return clean;
}

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date().toISOString();
}

export async function syncUserProfileToFirestore(
  user: FirebaseUser,
  prefs: {
    displayName: string;
    photoURL?: string | null;
    themePreference: 'dark' | 'light';
    audioEnabled: boolean;
    audioVolume: number;
  },
): Promise<{
  displayName: string;
  themePreference: 'dark' | 'light';
  audioEnabled: boolean;
  audioVolume: number;
  createdAt?: string;
}> {
  const path = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const safeDisplayName =
    (prefs.displayName || user.displayName || user.email?.split('@')[0] || 'Researcher')
      .trim()
      .slice(0, 150) || 'Researcher';
  const rawPhoto = prefs.photoURL !== undefined ? prefs.photoURL : user.photoURL;
  const safePhoto =
    typeof rawPhoto === 'string' && rawPhoto.length > 0 && rawPhoto.length <= 980
      ? rawPhoto
      : null;
  const safeEmail = (user.email || '').slice(0, 255);
  const safeTheme: 'dark' | 'light' = prefs.themePreference === 'dark' ? 'dark' : 'light';
  const safeAudio = Boolean(prefs.audioEnabled);
  const safeVolume = Math.max(0, Math.min(1, Number(prefs.audioVolume ?? 0.45)));

  let existingSnap;
  try {
    existingSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!existingSnap.exists()) {
    try {
      await setDoc(userRef, {
        uid: user.uid,
        email: safeEmail,
        displayName: safeDisplayName,
        photoURL: safePhoto,
        themePreference: safeTheme,
        audioEnabled: safeAudio,
        audioVolume: safeVolume,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return {
        displayName: safeDisplayName,
        themePreference: safeTheme,
        audioEnabled: safeAudio,
        audioVolume: safeVolume,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  try {
    await updateDoc(userRef, {
      displayName: safeDisplayName,
      photoURL: safePhoto,
      themePreference: safeTheme,
      audioEnabled: safeAudio,
      audioVolume: safeVolume,
      updatedAt: serverTimestamp(),
    });
    const existingData = existingSnap.data();
    return {
      displayName: safeDisplayName,
      themePreference: safeTheme,
      audioEnabled: safeAudio,
      audioVolume: safeVolume,
      createdAt: timestampToIso(existingData?.createdAt),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserPreferencesInFirestore(
  user: FirebaseUser,
  prefs: {
    displayName: string;
    photoURL?: string | null;
    themePreference: 'dark' | 'light';
    audioEnabled: boolean;
    audioVolume: number;
  },
): Promise<void> {
  await syncUserProfileToFirestore(user, {
    displayName: prefs.displayName,
    photoURL: prefs.photoURL,
    themePreference: prefs.themePreference,
    audioEnabled: prefs.audioEnabled,
    audioVolume: prefs.audioVolume,
  });
}

export async function saveSimulationToFirestore(
  uid: string,
  simId: string,
  config: SimulationConfig,
  output: SimulationOutput,
): Promise<string> {
  const baseSimId = simId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 100) || `sim_${Date.now()}`;
  let safeSimId = baseSimId;
  const candidateRef = doc(db, 'users', uid, 'simulations', baseSimId);
  try {
    const existing = await getDoc(candidateRef);
    if (existing.exists()) {
      safeSimId = `${baseSimId}_${Date.now()}`.slice(0, 128);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}/simulations/${baseSimId}`);
  }
  const simPath = `users/${uid}/simulations/${safeSimId}`;
  const simRef = doc(db, 'users', uid, 'simulations', safeSimId);

  const safeDestDist =
    typeof config.destinationDistance === 'number' &&
    Number.isFinite(config.destinationDistance) &&
    config.destinationDistance > 0
      ? config.destinationDistance
      : null;

  const payload = {
    uid,
    simulationName:
      (config.simulationName || 'Projectile Simulation').trim().slice(0, 200) ||
      'Projectile Simulation',
    projectileType: config.projectileType,
    physicsModel: config.physicsModel,
    sourceEnvironment: String(config.sourceEnvironment).slice(0, 64) || 'open_field',
    destinationEnvironment: String(config.destinationEnvironment).slice(0, 64) || 'open_field',
    environmentTime: config.environmentTime === 'evening' ? 'evening' : 'day',
    environmentWeather: ['clear', 'overcast', 'windy'].includes(config.environmentWeather)
      ? config.environmentWeather
      : 'clear',
    initialVelocity: Math.min(5000, Math.max(0.01, Number(config.initialVelocity))),
    launchAngleDeg: Math.min(89.99, Math.max(0.01, Number(config.launchAngleDeg))),
    gravity: Math.min(100, Math.max(0.01, Number(config.gravity))),
    timeStep: Math.min(2, Math.max(0.0001, Number(config.timeStep))),
    initialHeight: Math.min(10000, Math.max(0, Number(config.initialHeight || 0))),
    mass: Math.min(100000, Math.max(0.001, Number(config.mass))),
    dragCoefficient: Math.min(10, Math.max(0, Number(config.dragCoefficient || 0))),
    airDensity: Math.min(25, Math.max(0, Number(config.airDensity || 0))),
    crossSectionalArea: Math.min(200, Math.max(0, Number(config.crossSectionalArea || 0))),
    thrust: Math.max(0, Number(config.thrust || 0)),
    burnTime: Math.max(0, Number(config.burnTime || 0)),
    dryMass: Math.max(0.001, Number(config.dryMass || config.mass || 1)),
    liftCoefficient: Math.max(0, Number(config.liftCoefficient || 0)),
    wingArea: Math.max(0, Number(config.wingArea || 0)),
    destinationDistance: safeDestDist,
    destinationHeight: Math.max(0, Number(config.destinationHeight || 0)),
    destinationTolerance: Math.max(0.01, Number(config.destinationTolerance || 1)),
    maximumHeight: Number(output.summary.maximum_height),
    flightTime: Math.max(0, Number(output.summary.flight_time)),
    horizontalRange: Math.max(0, Number(output.summary.horizontal_range)),
    finalVelocity: Math.max(0, Number(output.summary.final_velocity)),
    maxSpeed: Math.max(0, Number(output.summary.max_speed)),
    stepCount: Math.max(1, Number(output.summary.step_count || output.steps.length || 1)),
    destinationReached: output.summary.destination_reached ?? null,
    destinationDelta:
      typeof output.summary.destination_delta === 'number' &&
      Number.isFinite(output.summary.destination_delta)
        ? output.summary.destination_delta
        : null,
    yAtDestination:
      typeof output.summary.y_at_destination === 'number' &&
      Number.isFinite(output.summary.y_at_destination)
        ? output.summary.y_at_destination
        : null,
    analyticalSummary: output.analytical
      ? {
          flight_time: Number(output.analytical.flight_time),
          maximum_height: Number(output.analytical.maximum_height),
          horizontal_range: Number(output.analytical.horizontal_range),
          final_velocity: Number(output.analytical.final_velocity),
        }
      : null,
    errorsSummary: output.errors
      ? {
          flight_time: {
            abs: Number(output.errors.flight_time.abs),
            pct: output.errors.flight_time.pct ?? null,
          },
          maximum_height: {
            abs: Number(output.errors.maximum_height.abs),
            pct: output.errors.maximum_height.pct ?? null,
          },
          horizontal_range: {
            abs: Number(output.errors.horizontal_range.abs),
            pct: output.errors.horizontal_range.pct ?? null,
          },
          final_velocity: {
            abs: Number(output.errors.final_velocity.abs),
            pct: output.errors.final_velocity.pct ?? null,
          },
          max_step_position_error: Number(output.errors.max_step_position_error),
          max_step_velocity_error: Number(output.errors.max_step_velocity_error),
        }
      : null,
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(simRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, simPath);
  }

  // Write RK4 iteration step batches matching firestore.rules (max 500 per batch, batchIndex <= 100)
  const sanitizedSteps = output.steps.map(sanitizeStep);
  if (sanitizedSteps.length === 0) return safeSimId;

  const batchSize = Math.min(500, Math.max(200, Math.ceil(sanitizedSteps.length / 100)));
  const totalBatches = Math.min(101, Math.ceil(sanitizedSteps.length / batchSize));

  for (let i = 0; i < totalBatches; i += 1) {
    const chunk = sanitizedSteps.slice(i * batchSize, (i + 1) * batchSize);
    if (chunk.length === 0) continue;
    const batchId = `batch_${i}`;
    const batchPath = `${simPath}/stepBatches/${batchId}`;
    try {
      await setDoc(doc(db, 'users', uid, 'simulations', safeSimId, 'stepBatches', batchId), {
        uid,
        batchIndex: i,
        steps: chunk,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, batchPath);
    }
  }
  return safeSimId;
}

export async function listSimulationsFromFirestore(
  uid: string,
): Promise<SavedSimulationRecord[]> {
  const path = `users/${uid}/simulations`;
  try {
    const q = query(collection(db, 'users', uid, 'simulations'), where('uid', '==', uid));
    const snap = await getDocs(q);
    const items: SavedSimulationRecord[] = snap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        uid: String(d.uid),
        simulationName: String(d.simulationName),
        projectileType: d.projectileType,
        physicsModel: d.physicsModel,
        sourceEnvironment: d.sourceEnvironment,
        destinationEnvironment: d.destinationEnvironment,
        environmentTime: d.environmentTime ?? 'day',
        environmentWeather: d.environmentWeather ?? 'clear',
        initialVelocity: Number(d.initialVelocity),
        launchAngleDeg: Number(d.launchAngleDeg),
        gravity: Number(d.gravity),
        timeStep: Number(d.timeStep),
        initialHeight: Number(d.initialHeight ?? 0),
        mass: Number(d.mass),
        airDensity: Number(d.airDensity),
        dragCoefficient: Number(d.dragCoefficient),
        crossSectionalArea: Number(d.crossSectionalArea),
        thrust: Number(d.thrust ?? 0),
        burnTime: Number(d.burnTime ?? 0),
        dryMass: Number(d.dryMass ?? d.mass),
        liftCoefficient: Number(d.liftCoefficient ?? 0),
        wingArea: Number(d.wingArea ?? 0),
        destinationDistance:
          typeof d.destinationDistance === 'number' ? d.destinationDistance : null,
        destinationHeight: Number(d.destinationHeight ?? 0),
        destinationTolerance: Number(d.destinationTolerance ?? 5),
        maximumHeight: Number(d.maximumHeight),
        flightTime: Number(d.flightTime),
        horizontalRange: Number(d.horizontalRange),
        finalVelocity: Number(d.finalVelocity),
        maxSpeed: Number(d.maxSpeed),
        stepCount: Number(d.stepCount),
        destinationReached:
          typeof d.destinationReached === 'boolean' ? d.destinationReached : null,
        destinationDelta: typeof d.destinationDelta === 'number' ? d.destinationDelta : null,
        yAtDestination: typeof d.yAtDestination === 'number' ? d.yAtDestination : null,
        analyticalSummary: d.analyticalSummary ?? null,
        errorsSummary: d.errorsSummary ?? null,
        createdAt: timestampToIso(d.createdAt),
      };
    });
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function loadSimulationStepsFromFirestore(
  uid: string,
  simId: string,
): Promise<RK4Step[]> {
  const path = `users/${uid}/simulations/${simId}/stepBatches`;
  try {
    const q = query(
      collection(db, 'users', uid, 'simulations', simId, 'stepBatches'),
      where('uid', '==', uid),
    );
    const snap = await getDocs(q);
    const batches = snap.docs
      .map((d) => ({
        batchIndex: Number(d.data().batchIndex ?? 0),
        steps: (d.data().steps ?? []) as RK4Step[],
      }))
      .sort((a, b) => a.batchIndex - b.batchIndex);
    return batches.flatMap((b) => b.steps);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteSimulationFromFirestore(uid: string, simId: string): Promise<void> {
  const batchesPath = `users/${uid}/simulations/${simId}/stepBatches`;
  try {
    const q = query(
      collection(db, 'users', uid, 'simulations', simId, 'stepBatches'),
      where('uid', '==', uid),
    );
    const snap = await getDocs(q);
    await Promise.all(
      snap.docs.map((batchDoc) =>
        deleteDoc(doc(db, 'users', uid, 'simulations', simId, 'stepBatches', batchDoc.id)),
      ),
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, batchesPath);
  }

  const simPath = `users/${uid}/simulations/${simId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'simulations', simId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, simPath);
  }
}
