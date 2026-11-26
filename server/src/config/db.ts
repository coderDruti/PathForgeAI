import mongoose from "mongoose";
import { env } from "./env.js";

let memoryServer: { stop: () => Promise<boolean> } | null = null;

export async function connectDatabase(): Promise<string> {
  let uri = env.mongoUri;

  if (env.useInMemoryMongo) {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const instance = await MongoMemoryServer.create();
    memoryServer = instance;
    uri = instance.getUri("career_recommender");
    console.log(`[db] Started in-memory MongoDB at ${uri}`);
  }

  await mongoose.connect(uri);
  console.log(`[db] Connected to MongoDB (${env.useInMemoryMongo ? "in-memory" : uri})`);
  return uri;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
