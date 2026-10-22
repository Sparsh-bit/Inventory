import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { Category, Product, Types } from "@/server/models";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { CategoryManager } from "@/components/products/category-manager";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const ctx = await requireCtx("products:write");
  const [cats, counts] = await Promise.all([
    Category.find({ orgId: ctx.orgId }).sort({ name: 1 }).lean(),
    Product.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { orgId: new Types.ObjectId(ctx.orgId), categoryId: { $ne: null } } }, { $group: { _id: "$categoryId", n: { $sum: 1 } } }]),
  ]);
  const count = new Map(counts.map((c) => [String(c._id), c.n]));
  return (
    <PageBody className="max-w-3xl">
      <PageHeader title="Categories" description="Group products for easier search and reports." back={{ href: "/products", label: "Products" }} />
      <CategoryManager categories={cats.map((c) => ({ id: String(c._id), name: c.name, parentId: c.parentId ? String(c.parentId) : null, products: count.get(String(c._id)) ?? 0 }))} />
    </PageBody>
  );
}
