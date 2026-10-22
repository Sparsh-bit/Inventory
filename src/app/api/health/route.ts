import { connectDb } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness + readiness for Railway/Docker health checks. Fails if MongoDB is down or not a replica set. */
export async function GET() {
  try {
    const db = (await connectDb()).connection.db!;
    const hello = await db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== "isdbgrid") {
      return Response.json({ ok: false, error: "MongoDB must be a replica set (transactions). Use MongoDB Atlas or start mongod with --replSet." }, { status: 503 });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "Database unreachable" }, { status: 503 });
  }
}
