import { MongoMemoryReplSet } from 'mongodb-memory-server';

let mongod: MongoMemoryReplSet;

export async function setup(): Promise<void> {
  // Replica set: las transacciones de tenant.service requieren sesión replicada.
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env['MONGODB_TEST_URI'] = mongod.getUri();
}

export async function teardown(): Promise<void> {
  if (mongod) await mongod.stop();
}
