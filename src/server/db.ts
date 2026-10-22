import "server-only";
import mongoose from "mongoose";
import { env } from "@/env";

mongoose.set("strictQuery", true);
mongoose.set("sanitizeFilter", true);

const g = globalThis as unknown as { __mongoose?: Promise<typeof mongoose> };

export function connectDb(): Promise<typeof mongoose> {
  g.__mongoose ??= mongoose.connect(env.MONGODB_URI, { maxPoolSize: 20 }).catch((err) => {
    g.__mongoose = undefined;
    throw err;
  });
  return g.__mongoose;
}
