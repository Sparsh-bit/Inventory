import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { ProductForm } from "@/components/products/product-form";
import { productFormData } from "../form-data";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  const ctx = await requireCtx("products:write");
  return (
    <PageBody>
      <PageHeader title="New product" back={{ href: "/products", label: "Products" }} />
      <ProductForm {...await productFormData(ctx)} />
    </PageBody>
  );
}
