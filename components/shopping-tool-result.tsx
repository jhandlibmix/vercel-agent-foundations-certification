"use client";

import Link from "next/link";
import { getToolName, type ToolUIPart, type DynamicToolUIPart } from "ai";
import { ProductCard } from "@/components/product-card";
import { ToolFrame } from "@/components/tool-frame";
import { formatPrice } from "@/lib/format";
import { categoriesOutput, productDetailsOutput, searchProductsOutput } from "@/lib/shopping-schemas";
import { returnOutput } from "@/lib/return-schemas";

type ToolPart = ToolUIPart | DynamicToolUIPart;

// Plain-language titles so shoppers never see internal tool identifiers.
const TOOL_LABELS: Record<string, string> = {
  returnOrder: "Return request",
  searchProducts: "Product search",
  getProductDetails: "Product details",
  getAllCategories: "Categories",
};

export function ShoppingToolResult({ part }: { part: ToolPart }): React.JSX.Element {
  const name = getToolName(part);
  const label = TOOL_LABELS[name] ?? "Store lookup";
  return (
    <ToolFrame tool={part} title={label}>
      <ShoppingToolBody part={part} name={name} label={label} />
    </ToolFrame>
  );
}

function ShoppingToolBody({ part, name, label }: { part: ToolPart; name: string; label: string }): React.JSX.Element {
  if (part.state === "output-error" || part.state === "output-denied") {
    return <p role="alert" className="text-sm text-destructive">{name === "returnOrder" ? "We couldn't confirm whether your return started. It may already be in progress, so please don't submit another request yet." : `${label} could not be completed. Please try again.`}</p>;
  }
  if (part.state !== "output-available") {
    return <p role="status" className="text-sm text-muted-foreground">{name === "returnOrder" ? "Starting your return…" : `Looking up ${label.toLowerCase()}…`}</p>;
  }
  // A filed request acknowledges the detached workflow, not a completed refund.
  // Only `message` is customer-facing; `guidance` stays with the model.
  if (name === "returnOrder") {
    const result = returnOutput.safeParse(part.output);
    if (result.success) return <p role={result.data.ok ? "status" : "alert"} className="text-sm">{result.data.message}</p>;
  }
  if (name === "searchProducts") {
    const result = searchProductsOutput.safeParse(part.output);
    if (result.success) {
      const output = result.data;
      if (!output.ok) return <p role="alert" className="text-sm">{output.message}</p>;
      if (output.products.length === 0) return <p className="text-sm">No products match these filters. Try another search or category.</p>;
      return <section aria-label="Product search results" className="@container space-y-2">
        {/* Columns follow the chat panel width, not the viewport. */}
        <div className="grid grid-cols-1 gap-3 @xs:grid-cols-2">
          {output.products.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
        <p className="text-xs text-muted-foreground">Page {output.pagination.page} of {output.pagination.totalPages} · {output.pagination.total} products{output.pagination.hasNextPage ? " · Ask to see the next page." : ""}</p>
      </section>;
    }
  }
  if (name === "getProductDetails") {
    const result = productDetailsOutput.safeParse(part.output);
    if (result.success) {
      const output = result.data;
      if (!output.ok) return <p role="alert" className="text-sm">{output.message}</p>;
      return <section aria-label="Product details" className="space-y-3">
        <ProductCard product={output.product} />
        <p className="text-sm">{output.product.description}</p>
        <p className="text-sm font-medium">{formatPrice(output.product.price, output.product.currency)} · {output.stock.inStock ? `${output.stock.stock} available${output.stock.lowStock ? " — low stock" : ""}` : "Out of stock"}</p>
      </section>;
    }
  }
  if (name === "getAllCategories") {
    const result = categoriesOutput.safeParse(part.output);
    if (result.success) {
      if (!result.data.ok) return <p role="alert" className="text-sm">{result.data.message}</p>;
      if (!result.data.categories.length) return <p className="text-sm">No categories are available.</p>;
      return <nav aria-label="Store categories">
        <ul className="flex flex-wrap gap-2">
          {result.data.categories.map((category) => (
            <li key={category.slug}>
              <Link
                href={`/search?category=${encodeURIComponent(category.slug)}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {category.name}
                <span className="text-xs text-muted-foreground" aria-hidden="true">{category.productCount}</span>
                <span className="sr-only">({category.productCount} products)</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>;
    }
  }
  return <p role="alert" className="text-sm">This lookup returned an unreadable result. Please try again.</p>;
}
