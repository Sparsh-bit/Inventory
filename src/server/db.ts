import "server-only";
import mongoose from "mongoose";
import { env } from "@/env";

// Operator injection is prevented by strict Zod parsing at every entry point (inputs are
// always strings/numbers before they reach a filter); global sanitizeFilter would also
// neutralise our own `$gte` conditions.
mongoose.set("strictQuery", true);

const g = globalThis as unknown as { __mongoose?: Promise<typeof mongoose> };

export function connectDb(): Promise<typeof mongoose> {
  g.__mongoose ??= mongoose.connect(env.MONGODB_URI, { maxPoolSize: 20 }).catch((err) => {
    g.__mongoose = undefined;
    throw err;
  });
  return g.__mongoose;
}
