import type { ComponentType, JSX, ReactNode } from "react";
import { z } from "zod";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { rangeMeta, returnRow, salesMeta, salesRow, stockMeta, stockRow, ticketRow } from "@/lib/admin-schemas";

const TOP_ROWS = 5;
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const UNKNOWN_PRIORITY_RANK = 9;

type ViewProps = { rows: unknown[]; meta: unknown; limit: number };
type RangeMeta = z.infer<typeof rangeMeta>;
type TicketRow = z.infer<typeof ticketRow>;
type StockRow = z.infer<typeof stockRow>;
type StockPagination = z.infer<typeof stockMeta>["pagination"];
type DataTableRow = { key: string; cells: string[] };

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function humanize(value: string): string {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

function countBy<T>(rows: T[], key: (row: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return [...counts.entries()];
}

function parseRows<T>(schema: z.ZodType<T>, rows: unknown[]): T[] | null {
  const parsed = z.array(schema).safeParse(rows);
  return parsed.success ? parsed.data : null;
}

// Most urgent first; ties go to the newest ticket.
function byUrgency(a: TicketRow, b: TicketRow): number {
  const rankOf = (ticket: TicketRow): number => PRIORITY_RANK[ticket.priority] ?? UNKNOWN_PRIORITY_RANK;
  return rankOf(a) - rankOf(b) || b.createdAt.localeCompare(a.createdAt);
}

function stockStatus(row: StockRow): string {
  if (!row.inStock) return "Out of stock";
  return row.lowStock ? "Low stock" : "In stock";
}

function inventorySummary(shown: number, pagination: StockPagination | null): string {
  if (!pagination) return `${plural(shown, "product")}.`;
  const { page, limit, total, totalPages } = pagination;
  if (shown >= total) return `Showing all ${plural(total, "product")}.`;
  const first = (page - 1) * limit + 1;
  return `Showing ${formatNumber(first)}–${formatNumber(first + shown - 1)} of ${plural(total, "product")} (page ${page} of ${totalPages}).`;
}

function Chips({ label, entries }: { label: string; entries: [string, string | number][] }): JSX.Element | null {
  if (!entries.length) return null;
  return (
    <div className="mt-2">
      <p className="sr-only">{label}</p>
      <ul aria-label={label} className="flex flex-wrap gap-1.5">
        {entries.map(([name, value]) => (
          <li key={name} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {name} <span className="font-medium text-foreground">{typeof value === "number" ? formatNumber(value) : value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }): JSX.Element {
  return <p className="mt-2 text-xs text-muted-foreground">{children}</p>;
}

function HistoryNote(): JSX.Element {
  return <Note>Store history covers about the last 180 days.</Note>;
}

function CappedNote({ shown, limit, noun }: { shown: number; limit: number; noun: string }): JSX.Element | null {
  if (shown < limit) return null;
  return <Note>Showing the first {plural(shown, noun.replace(/s$/, ""))}; there may be more. Ask for a larger limit (up to 500) for the full picture.</Note>;
}

// "N items from X to Y." with the date range omitted when the metadata is unexpected.
function RangeSummary({ count, noun, range }: { count: number; noun: string; range: RangeMeta | null }): JSX.Element {
  const span = range ? ` from ${formatDate(range.from)} to ${formatDate(range.to)}` : "";
  return <p role="status">{plural(count, noun)}{span}.</p>;
}

function DataTable({ caption, headers, rows, numeric = [] }: { caption: string; headers: string[]; rows: DataTableRow[]; numeric?: number[] }): JSX.Element | null {
  if (!rows.length) return null;
  // The shadcn Table container already scrolls horizontally inside narrow chat panels.
  return (
    <div className="mt-3 min-w-0 overflow-hidden rounded-md border">
      <Table className="text-xs">
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            {headers.map((header, index) => <TableHead key={header} className={cn("h-8 px-2", numeric.includes(index) && "text-right")}>{header}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              {row.cells.map((cell, index) => (
                <TableCell key={headers[index]} className={cn("px-2 py-1.5", index === 0 && "max-w-48 truncate", numeric.includes(index) && "text-right tabular-nums")} title={index === 0 ? cell : undefined}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="border-t px-2 py-1 text-xs text-muted-foreground" aria-hidden="true">{caption}</p>
    </div>
  );
}

function TicketsView({ rows, meta, limit }: ViewProps): JSX.Element | null {
  const tickets = parseRows(ticketRow, rows);
  const range = rangeMeta.safeParse(meta);
  if (!tickets) return null;
  const top = [...tickets].sort(byUrgency).slice(0, TOP_ROWS);
  return (
    <>
      <RangeSummary count={tickets.length} noun="ticket" range={range.success ? range.data : null} />
      <Chips label="Tickets by status" entries={countBy(tickets, (t) => humanize(t.status))} />
      <Chips label="Tickets by priority" entries={countBy(tickets, (t) => humanize(t.priority))} />
      <DataTable
        caption={top.length < tickets.length ? `${top.length} most urgent of ${tickets.length} tickets` : "Tickets, most urgent first"}
        headers={["Subject", "Status", "Priority", "Assignee"]}
        rows={top.map((t) => ({ key: t.id, cells: [t.subject, humanize(t.status), humanize(t.priority), t.assignee ?? "Unassigned"] }))}
      />
      <CappedNote shown={tickets.length} limit={limit} noun="tickets" />
      <HistoryNote />
    </>
  );
}

function ReturnsView({ rows, meta, limit }: ViewProps): JSX.Element | null {
  const returns = parseRows(returnRow, rows);
  const range = rangeMeta.safeParse(meta);
  if (!returns) return null;
  const refunded = returns.reduce((sum, r) => sum + (r.refundAmount ?? 0), 0);
  const top = [...returns].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, TOP_ROWS);
  return (
    <>
      <RangeSummary count={returns.length} noun="return" range={range.success ? range.data : null} />
      <Chips label="Returns by status" entries={countBy(returns, (r) => humanize(r.status))} />
      <Chips label="Decisions" entries={countBy(returns.filter((r) => r.decision), (r) => humanize(r.decision ?? ""))} />
      {refunded ? <p className="mt-2">Refunds in these results: <span className="font-medium">{formatPrice(refunded)}</span></p> : null}
      <DataTable
        caption={top.length < returns.length ? `${top.length} most recent of ${returns.length} returns` : "Returns, most recent first"}
        headers={["Order", "Status", "Decision", "Refund"]}
        rows={top.map((r) => ({
          key: r.id,
          cells: [
            r.orderId,
            humanize(r.status),
            r.decision ? humanize(r.decision) : "Pending",
            r.refundAmount === null ? "—" : formatPrice(r.refundAmount),
          ],
        }))}
      />
      <CappedNote shown={returns.length} limit={limit} noun="returns" />
      <HistoryNote />
    </>
  );
}

// Inventory is paged by the API, so it ignores the history `limit`.
function InventoryView({ rows, meta }: ViewProps): JSX.Element | null {
  const stock = parseRows(stockRow, rows);
  const page = stockMeta.safeParse(meta);
  if (!stock) return null;
  const top = [...stock].sort((a, b) => a.stock - b.stock).slice(0, TOP_ROWS);
  const pagination = page.success ? page.data.pagination : null;
  return (
    <>
      <p role="status">{inventorySummary(stock.length, pagination)}</p>
      <Chips label="Stock levels" entries={countBy(stock, stockStatus)} />
      <DataTable
        caption={top.length < stock.length ? `${top.length} lowest-stock products on this page` : "Products, lowest stock first"}
        headers={["Product", "Category", "Units", "Status"]}
        rows={top.map((s) => ({ key: s.productId, cells: [s.product.name, humanize(s.product.category), formatNumber(s.stock), stockStatus(s)] }))}
        numeric={[2]}
      />
      {pagination?.hasNextPage ? <Note>More products are on later pages, so rankings here cover only this page.</Note> : null}
      <Note>These are current stock levels, not historical ones.</Note>
    </>
  );
}

// Sales are aggregated over a date range, so they ignore the history `limit`.
function SalesView({ rows, meta }: ViewProps): JSX.Element | null {
  const sales = parseRows(salesRow, rows);
  const info = salesMeta.safeParse(meta);
  if (!sales || !info.success) return null;
  const { totals, currency } = info.data;
  const top = [...sales].sort((a, b) => b.revenue - a.revenue).slice(0, TOP_ROWS);
  const totalTiles = [
    ["Revenue", formatPrice(totals.revenue, currency)],
    ["Orders", formatNumber(totals.ordersCount)],
    ["Units", formatNumber(totals.unitsSold)],
  ] as const;
  return (
    <>
      <p role="status">Sales from {formatDate(info.data.from)} to {formatDate(info.data.to)} ({plural(info.data.days, "day")}).</p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        {totalTiles.map(([term, value]) => (
          <div key={term} className="rounded-md bg-muted px-2 py-1.5">
            <dt className="text-xs text-muted-foreground">{term}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {sales.length ? (
        <DataTable
          caption={top.length < sales.length ? `Top ${top.length} of ${sales.length} products by revenue` : "Products by revenue"}
          headers={["Product", "Units", "Orders", "Revenue"]}
          rows={top.map((s) => ({
            key: s.productId,
            cells: [s.product.name, formatNumber(s.unitsSold), formatNumber(s.ordersCount), formatPrice(s.revenue, s.currency)],
          }))}
          numeric={[1, 2, 3]}
        />
      ) : null}
      {totals.revenue === 0 ? <Note>No sales were recorded in this period. Sales history covers about the last 180 days, so older periods show zero.</Note> : null}
    </>
  );
}

const DATASET_VIEWS: Record<string, ComponentType<ViewProps>> = {
  getSupportTickets: TicketsView,
  getReturnsHistory: ReturnsView,
  getInventoryStock: InventoryView,
  getSalesAnalytics: SalesView,
};

export function DatasetView({ name, rows, meta, limit, noun }: ViewProps & { name: string; noun: string }): JSX.Element {
  if (!rows.length && name !== "getSalesAnalytics") return <p role="status">No {noun} match these filters.</p>;
  const View = DATASET_VIEWS[name];
  const view = View ? <View rows={rows} meta={meta} limit={limit} /> : null;
  // Unexpected shapes still get a truthful, plain summary instead of raw data.
  return view ?? <p role="status">{rows.length ? `Loaded ${plural(rows.length, "record")}.` : `No ${noun} match these filters.`}</p>;
}
