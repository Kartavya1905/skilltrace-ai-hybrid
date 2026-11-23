import { SCHEMA_VERSION, type BaseRecord, type Provenance } from './model';
import { nowIso, type Clock, systemClock } from './time';

/** Build the common record envelope (id, owner, timestamps, provenance, schema version). */
export function envelope(
  id: string,
  userId: string,
  provenance: Provenance,
  clock: Clock = systemClock,
): BaseRecord {
  const ts = nowIso(clock);
  return { id, userId, createdAt: ts, updatedAt: ts, provenance, schemaVersion: SCHEMA_VERSION };
}

export function touch<T extends BaseRecord>(record: T, clock: Clock = systemClock): T {
  return { ...record, updatedAt: nowIso(clock) };
}
