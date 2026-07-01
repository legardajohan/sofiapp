import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach } from 'vitest';

beforeAll(async () => {
  const uri = process.env['MONGODB_TEST_URI'];
  if (!uri) throw new Error('MONGODB_TEST_URI no fue configurado por globalSetup');
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key]?.deleteMany({});
  }
});
