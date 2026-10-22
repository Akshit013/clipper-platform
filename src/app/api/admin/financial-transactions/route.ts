import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_TYPES = new Set([
  "clip_earning", "earning_adjustment", "bonus_credit", "bonus_reversal",
  "bonus_paid_direct", "payout_reserved", "payout_paid", "payout_reversal", "manual_adjustment", "contest_prize",
]);
const PAGE_SIZE_MAX = 100;
const EXPORT_MAX_ROWS = 50000;

type Row = {
  id: string; user_id: string; event_type: string; amount_inr: number | string;
  balance_delta: number | string; currency?: string | null; source_table?: string | null;
  source_id?: string | null; description: string; created_at: string; metadata?: Record<string, unknown> | null;
  clipper_name?: string | null;
};

async function adminContext() {
  const session = await createServerSupabaseClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  const admin = createAdminClient() as any;
  const { data: profile, error: profileError } = await admin
    .from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profileError || profile?.role !== "admin") {
    return { response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  }
  return { admin };
}

function queryWithFilters(admin: any, url: URL, includeCount = false) {
  let q = admin.from("wallet_transactions").select(
    "id,user_id,event_type,amount_inr,balance_delta,currency,source_table,source_id,description,created_at,metadata",
    includeCount ? { count: "exact" } : undefined,
  );
  const type = url.searchParams.get("type") || "";
  const direction = url.searchParams.get("direction") || "";
  const userId = url.searchParams.get("userId") || "";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  if (type && VALID_TYPES.has(type)) q = q.eq("event_type", type);
  if (direction === "credit") q = q.gt("balance_delta", 0);
  if (direction === "debit") q = q.lt("balance_delta", 0);
  if (direction === "neutral") q = q.eq("balance_delta", 0);
  if (userId) q = q.eq("user_id", userId);
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte("created_at", `${from}T00:00:00.000Z`);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lte("created_at", `${to}T23:59:59.999Z`);
  return q.order("created_at", { ascending: false });
}

async function attachNames(admin: any, rows: Row[]): Promise<Row[]> {
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  if (!ids.length) return rows;
  const names = new Map<string, string>();
  // Chunk profile lookups so large exports do not create oversized URL/query payloads.
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data, error } = await admin.from("profiles").select("user_id,display_name").in("user_id", chunk);
    if (error) throw new Error(`Could not resolve clipper names for export: ${error.message}`);
    for (const p of data ?? []) names.set(p.user_id, p.display_name || "Clipper");
  }
  return rows.map((r) => ({ ...r, clipper_name: names.get(r.user_id) || "Unknown clipper" }));
}

async function getSummary(admin: any) {
  const { data, error } = await admin.from("admin_wallet_financial_summary").select("*").maybeSingle();
  if (error) throw new Error(`Financial summary unavailable. Confirm migration 009 is applied: ${error.message}`);
  return data ?? {};
}

function csvCell(value: unknown): string {
  const s = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function makeCsv(rows: Row[]): string {
  const headers = ["timestamp_utc", "clipper_name", "user_id", "event_type", "direction", "amount_inr", "balance_delta_inr", "description", "source_table", "source_id", "transaction_id", "metadata"];
  const lines = rows.map((r) => [
    r.created_at, r.clipper_name || "", r.user_id, r.event_type,
    Number(r.balance_delta) > 0 ? "credit" : Number(r.balance_delta) < 0 ? "debit" : "no wallet impact",
    Number(r.amount_inr).toFixed(2), Number(r.balance_delta).toFixed(2), r.description,
    r.source_table || "", r.source_id || "", r.id, r.metadata || {},
  ].map(csvCell).join(","));
  return "\uFEFF" + [headers.map(csvCell).join(","), ...lines].join("\r\n");
}

function pdfEscape(s: string) { return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function ascii(s: unknown): string {
  return String(s ?? "").replace(/₹/g, "INR ").replace(/—/g, "-").replace(/·/g, "-").replace(/[^\x20-\x7E]/g, "?");
}
function makePdf(lines: string[]): Buffer {
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += 46) chunks.push(lines.slice(i, i + 46));
  if (!chunks.length) chunks.push(["No transactions match the selected filters."]);
  const objs: string[] = [];
  const pageIds = chunks.map((_, i) => 4 + i * 2);
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  chunks.forEach((chunk, index) => {
    const pageId = pageIds[index]; const contentId = pageId + 1;
    const content = ["BT", "/F1 8 Tf", "40 800 Td", ...chunk.flatMap((line) => [`(${pdfEscape(ascii(line).slice(0, 150))}) Tj`, "0 -16 Td"]), "ET"].join("\n");
    objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objs[contentId] = `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`;
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i < objs.length; i++) { offsets[i] = Buffer.byteLength(pdf, "ascii"); pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xrefAt = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

export async function GET(request: NextRequest) {
  const ctx = await adminContext();
  if ("response" in ctx) return ctx.response;
  const { admin } = ctx;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "json";
  try {
    if (url.searchParams.get("summaryOnly") === "1") {
      return NextResponse.json({ summary: await getSummary(admin), generatedAt: new Date().toISOString() });
    }

    if (format === "csv" || format === "pdf") {
      const all: Row[] = [];
      const pageSize = 1000;
      for (let offset = 0; offset < EXPORT_MAX_ROWS; offset += pageSize) {
        const { data, error } = await queryWithFilters(admin, url).range(offset, offset + pageSize - 1);
        if (error) throw new Error(error.message);
        const batch = (data ?? []) as Row[];
        all.push(...batch);
        if (batch.length < pageSize) break;
      }
      const rows = await attachNames(admin, all);
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      const filtered = q ? rows.filter((r) => [r.clipper_name, r.user_id, r.description, r.event_type, r.source_id].some((v) => String(v ?? "").toLowerCase().includes(q))) : rows;
      if (format === "csv") {
        return new NextResponse(makeCsv(filtered), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="clipper-financial-transactions.csv"', "Cache-Control": "no-store" } });
      }
      const summary = await getSummary(admin);
      const lines = [
        "ClipperPlatform - Admin Financial Transactions",
        `Report generated (UTC): ${new Date().toISOString()}`,
        `Filters: type=${url.searchParams.get("type") || "all"}; direction=${url.searchParams.get("direction") || "all"}; from=${url.searchParams.get("from") || "any"}; to=${url.searchParams.get("to") || "any"}`,
        `Overall net bonus wallet credits (INR): ${summary.net_bonus_wallet_credits ?? 0}`,
        `Overall direct bonus payments recorded (INR): ${summary.bonuses_paid_direct ?? 0}`,
        "",
        "TIMESTAMP (UTC) | CLIPPER | TYPE | AMOUNT INR | WALLET DELTA INR | DESCRIPTION | USER ID | TRANSACTION ID",
        ...filtered.map((r) => `${r.created_at} | ${r.clipper_name || "Unknown"} | ${r.event_type} | ${Number(r.amount_inr).toFixed(2)} | ${Number(r.balance_delta).toFixed(2)} | ${r.description} | ${r.user_id} | ${r.id}`),
        "", `Rows exported: ${filtered.length}`, ...(all.length >= EXPORT_MAX_ROWS ? [`Export truncated at ${EXPORT_MAX_ROWS} rows; narrow the date range to export a smaller set.`] : []),
      ];
      return new NextResponse(Uint8Array.from(makePdf(lines)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="clipper-financial-transactions.pdf"', "Cache-Control": "no-store" } });
    }

    const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(10, Number(url.searchParams.get("pageSize") || 50) || 50));
    const { data, error, count } = await queryWithFilters(admin, url, true).range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = await attachNames(admin, (data ?? []) as Row[]);
    const summary = await getSummary(admin);
    return NextResponse.json({ rows, count: count ?? 0, page, pageSize, summary, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to load financial transactions.";
    return NextResponse.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
