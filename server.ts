import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createServer as createViteServer } from 'vite';
import {
  deleteSqliteSimulation,
  getSqliteSimulationSteps,
  listSqliteSimulations,
  saveSqliteSimulation,
  syncSqliteUser,
  updateSqliteUserPreferences,
} from './backend/engine/sqlite_store.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

// Load Firebase projectId from provisioned firebase-applet-config.json
let firebaseProjectId = process.env.FIREBASE_PROJECT_ID || '';
const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
if (!firebaseProjectId && fs.existsSync(firebaseConfigPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));
    firebaseProjectId = parsed.projectId || '';
  } catch {
    firebaseProjectId = '';
  }
}

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    name?: string;
    picture?: string;
  };
}

async function verifyFirebaseToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!firebaseProjectId) {
    res.status(503).json({ error: 'Firebase project configuration unavailable.' });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${firebaseProjectId}`,
      audience: firebaseProjectId,
    });

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      res.status(401).json({ error: 'Invalid token subject.' });
      return;
    }

    req.user = {
      uid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    };
    next();
  } catch (error) {
    res.status(401).json({
      error: 'Invalid or expired Firebase ID token.',
      detail: error instanceof Error ? error.message : 'Verification failed',
    });
  }
}

function invokePythonRk4(mode: 'simulate' | 'convergence', params: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', ['-m', 'backend.engine.cli'], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start Python RK4 engine: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        try {
          const parsedErr = JSON.parse(stderr);
          reject(new Error(parsedErr.error || 'RK4 calculation failed'));
        } catch {
          reject(new Error(stderr || `Python process exited with code ${code}`));
        }
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error(`Malformed JSON output from Python RK4 engine: ${(err as Error).message}`));
      }
    });

    proc.stdin.write(JSON.stringify({ mode, params }));
    proc.stdin.end();
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'projectile-lab',
    });
  });

  // User synchronization & preferences (SQLite, strictly isolated by verified JWT uid)
  app.post('/api/users/sync', verifyFirebaseToken, (req: AuthenticatedRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = String(req.body?.email || req.user?.email || '');
      const displayName = String(req.body?.displayName || req.user?.name || email.split('@')[0] || 'Researcher');
      const photoURL = (req.body?.photoURL || req.user?.picture || null) as string | null;
      const user = syncSqliteUser({ uid, email, displayName, photoURL });
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'User profile sync failed' });
    }
  });

  app.patch('/api/users/preferences', verifyFirebaseToken, (req: AuthenticatedRequest, res) => {
    try {
      const uid = req.user!.uid;
      const updated = updateSqliteUserPreferences(uid, req.body ?? {});
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update preferences' });
    }
  });

  // Python RK4 Computation Endpoints
  app.post('/api/simulations/compute', verifyFirebaseToken, async (req: AuthenticatedRequest, res) => {
    try {
      const result = await invokePythonRk4('simulate', req.body ?? {});
      res.json(result);
    } catch (error) {
      res.status(422).json({
        error: error instanceof Error ? error.message : 'Simulation computation error',
      });
    }
  });

  app.post('/api/simulations/convergence', verifyFirebaseToken, async (req: AuthenticatedRequest, res) => {
    try {
      const result = await invokePythonRk4('convergence', req.body ?? {});
      res.json(result);
    } catch (error) {
      res.status(422).json({
        error: error instanceof Error ? error.message : 'Convergence calculation error',
      });
    }
  });

  // Simulation Persistence CRUD (Strict Firebase UID Isolation)
  app.get('/api/simulations', verifyFirebaseToken, (req: AuthenticatedRequest, res) => {
    try {
      const items = listSqliteSimulations(req.user!.uid);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list simulations' });
    }
  });

  app.post('/api/simulations', verifyFirebaseToken, (req: AuthenticatedRequest, res) => {
    try {
      const { config, output } = req.body ?? {};
      if (!config || !output) {
        res.status(400).json({ error: 'Missing simulation config or output payload.' });
        return;
      }
      const id = saveSqliteSimulation(
        req.user!.uid,
        req.user?.email || '',
        req.user?.name || 'Researcher',
        config,
        output,
      );
      res.status(201).json({ id });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save simulation' });
    }
  });

  app.get('/api/simulations/:id/steps', verifyFirebaseToken, (req: AuthenticatedRequest, res) => {
    try {
      const steps = getSqliteSimulationSteps(req.user!.uid, String(req.params.id));
      res.json(steps);
    } catch (error) {
      res.status(404).json({ error: error instanceof Error ? error.message : 'Simulation steps not found' });
    }
  });

  app.delete('/api/simulations/:id', verifyFirebaseToken, (req: AuthenticatedRequest, res) => {
    try {
      const removed = deleteSqliteSimulation(req.user!.uid, String(req.params.id));
      if (!removed) {
        res.status(404).json({ error: 'Simulation not found or access denied' });
        return;
      }
      res.json({ deleted: true, id: req.params.id });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete simulation' });
    }
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PROJECTILE LAB server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PROJECTILE LAB server:', err);
  process.exit(1);
});
