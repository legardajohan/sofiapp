import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;

export async function setup(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_TEST_URI'] = mongod.getUri();
}

export async function teardown(): Promise<void> {
  if (mongod) await mongod.stop();
}
