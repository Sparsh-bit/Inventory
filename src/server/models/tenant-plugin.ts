import type { Schema } from "mongoose";

const QUERY_OPS = [
  "find", "findOne", "countDocuments", "updateOne", "updateMany", "deleteOne", "deleteMany",
  "findOneAndUpdate", "findOneAndDelete", "replaceOne", "distinct",
] as const;

/** Defence in depth: any query on a tenant model without an orgId filter throws. */
export function tenantPlugin(schema: Schema) {
  for (const op of QUERY_OPS) {
    schema.pre(op, function () {
      const filter = this.getFilter();
      if (!filter || filter.orgId === undefined) throw new Error(`Tenant scope missing on ${op}`);
    });
  }
  schema.pre("aggregate", function () {
    const first = this.pipeline()[0] as { $match?: { orgId?: unknown } } | undefined;
    if (!first?.$match || first.$match.orgId === undefined) throw new Error("Tenant scope missing on aggregate");
  });
}
