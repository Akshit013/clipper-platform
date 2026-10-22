import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-server";

const createCampaignSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  ratePer1000: z.number().finite().positive().max(1_000_000_000),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isActive: z.boolean().default(true),
}).refine((value) => value.endDate >= value.startDate, {
  message: "End date must be on or after the start date.",
  path: ["endDate"],
});

export async function POST(request: Request) {
  try {
    const { supabase } = await requireAdmin();
    const input = createCampaignSchema.parse(await request.json());
    const { data, error } = await supabase.from("campaigns").insert({
      name: input.name,
      description: input.description || null,
      rate_per_1000: input.ratePer1000,
      start_date: input.startDate,
      end_date: input.endDate,
      is_active: input.isActive,
    }).select("id,name,description,rate_per_1000,start_date,end_date,is_active,created_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ campaign: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "UNAUTHENTICATED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
