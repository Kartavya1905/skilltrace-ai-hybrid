/**
 * Firestore security rules tests. Run with the emulator:  pnpm test:rules
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

const now = '2026-11-23T10:00:00.000Z';
const envelope = (id: string, uid: string, provenance = 'self_reported') => ({
  id,
  userId: uid,
  createdAt: now,
  updatedAt: now,
  provenance,
  schemaVersion: 1,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-skilltrace',
    firestore: {
      rules: readFileSync('firebase/firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8085,
    },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('private records', () => {
  it('owner can write and read their own learning session', async () => {
    const ref = doc(alice(), 'users/alice/learning_sessions/s1');
    await assertSucceeds(
      setDoc(ref, {
        ...envelope('s1', 'alice', 'auto_recorded'),
        eligibleMs: 60000,
        rawMs: 70000,
        eligibleIntervals: [],
      }),
    );
    await assertSucceeds(getDoc(ref));
  });

  it("users cannot read or write another user's private records", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/projects/p1'), {
        ...envelope('p1', 'alice'),
        title: 'x',
      });
    });
    await assertFails(getDoc(doc(bob(), 'users/alice/projects/p1')));
    await assertFails(getDocs(collection(bob(), 'users/alice/projects')));
    await assertFails(
      setDoc(doc(bob(), 'users/alice/projects/p2'), { ...envelope('p2', 'alice'), title: 'y' }),
    );
    await assertFails(deleteDoc(doc(bob(), 'users/alice/projects/p1')));
    await assertFails(getDoc(doc(anon(), 'users/alice/projects/p1')));
  });

  it('rejects records whose owner or id does not match the path', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users/alice/skills/k1'), { ...envelope('k1', 'bob'), name: 'Python' }),
    );
    await assertFails(
      setDoc(doc(alice(), 'users/alice/skills/k1'), {
        ...envelope('other', 'alice'),
        name: 'Python',
      }),
    );
  });

  it('rejects unknown collections', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/secrets/x'), envelope('x', 'alice')));
  });

  it('no client may claim independent verification', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users/alice/assessments/a1'), {
        ...envelope('a1', 'alice', 'independently_verified'),
        score: 1,
        maxScore: 1,
        verificationLevel: 'self_attempted_unproctored',
      }),
    );
    await assertFails(
      setDoc(doc(alice(), 'users/alice/assessments/a2'), {
        ...envelope('a2', 'alice', 'assessment_result'),
        score: 1,
        maxScore: 1,
        verificationLevel: 'independently_proctored',
      }),
    );
    await assertFails(
      setDoc(doc(alice(), 'users/alice/assessments/a3'), {
        ...envelope('a3', 'alice', 'assessment_result'),
        score: 6,
        maxScore: 5,
        verificationLevel: 'self_attempted_unproctored',
      }),
    );
    await assertSucceeds(
      setDoc(doc(alice(), 'users/alice/assessments/a4'), {
        ...envelope('a4', 'alice', 'assessment_result'),
        score: 4,
        maxScore: 5,
        verificationLevel: 'self_attempted_unproctored',
      }),
    );
  });
});

describe('business rules', () => {
  it('GitHub milestones always carry zero hours', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users/alice/github_milestones/m1'), {
        ...envelope('m1', 'alice', 'github_metadata'),
        durationMs: 3600000,
      }),
    );
    await assertSucceeds(
      setDoc(doc(alice(), 'users/alice/github_milestones/m2'), {
        ...envelope('m2', 'alice', 'github_metadata'),
        durationMs: 0,
      }),
    );
  });

  it('project work time only from manual or timer entries', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users/alice/project_work_sessions/w1'), {
        ...envelope('w1', 'alice', 'github_metadata'),
        durationMs: 3600000,
      }),
    );
    await assertFails(
      setDoc(doc(alice(), 'users/alice/project_work_sessions/w2'), {
        ...envelope('w2', 'alice', 'self_reported'),
        durationMs: 20 * 3600000,
      }),
    );
    await assertSucceeds(
      setDoc(doc(alice(), 'users/alice/project_work_sessions/w3'), {
        ...envelope('w3', 'alice', 'timer_recorded'),
        durationMs: 2 * 3600000,
      }),
    );
  });

  it('GitHub tokens are never stored in Firestore', async () => {
    await assertFails(
      setDoc(doc(alice(), 'users/alice/github_connections/github'), {
        ...envelope('github', 'alice', 'github_metadata'),
        username: 'a',
        accessToken: 'gho_x',
      }),
    );
    await assertSucceeds(
      setDoc(doc(alice(), 'users/alice/github_connections/github'), {
        ...envelope('github', 'alice', 'github_metadata'),
        username: 'a',
      }),
    );
  });
});

describe('public passports', () => {
  const passport = (shareId: string, ownerUid: string, extra: Record<string, unknown> = {}) => ({
    shareId,
    ownerUid,
    visibility: 'public',
    schemaVersion: 1,
    publishedAt: now,
    displayName: 'Alice',
    headline: 'Learner',
    githubUrl: '',
    portfolioUrl: '',
    summary: '',
    skills: [],
    projects: [],
    limitations: [],
    ...extra,
  });

  it('owner can publish; anyone can read by id; nobody can list', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'public_passports/pp_1'), passport('pp_1', 'alice')));
    await assertSucceeds(getDoc(doc(anon(), 'public_passports/pp_1')));
    await assertFails(getDocs(collection(anon(), 'public_passports')));
  });

  it('public profile exposes only allow-listed fields', async () => {
    await assertFails(
      setDoc(
        doc(alice(), 'public_passports/pp_2'),
        passport('pp_2', 'alice', { email: 'alice@example.com' }),
      ),
    );
    await assertFails(
      setDoc(doc(alice(), 'public_passports/pp_3'), passport('pp_3', 'alice', { rawEvents: [] })),
    );
  });

  it('cannot publish as someone else, or overwrite or delete another user passport', async () => {
    await assertFails(setDoc(doc(bob(), 'public_passports/pp_4'), passport('pp_4', 'alice')));
    await assertSucceeds(setDoc(doc(alice(), 'public_passports/pp_5'), passport('pp_5', 'alice')));
    await assertFails(setDoc(doc(bob(), 'public_passports/pp_5'), passport('pp_5', 'bob')));
    await assertFails(deleteDoc(doc(bob(), 'public_passports/pp_5')));
    await assertSucceeds(deleteDoc(doc(alice(), 'public_passports/pp_5')));
  });

  it('unauthenticated users cannot write', async () => {
    await assertFails(setDoc(doc(anon(), 'public_passports/pp_6'), passport('pp_6', 'alice')));
  });
});
