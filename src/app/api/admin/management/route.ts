import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const MAX_METRIC = 1_000_000_000;

type AdminContext = { user: any; admin: any };
type ContextResult = AdminContext | { response: NextResponse };

async function getAdminContext(): Promise<ContextResult> {
  const session = await createServerSupabaseClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };

  const admin = createAdminClient() as any;
  const { data: profile, error: profileError } = await admin
    .from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profileError || profile?.role !== "admin") {
    return { response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  }
  return { user, admin };
}

function isContextError(value: ContextResult): value is { response: NextResponse } {
  return "response" in value;
}

function readCount(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_METRIC) throw new Error(`${label} must be a whole number from 0 to ${MAX_METRIC.toLocaleString("en-US")}.`);
  return n;
}

function readReason(value: unknown): string {
  const reason = String(value ?? "").trim();
  if (reason.length < 3) throw new Error("Enter a reason of at least 3 characters. This is recorded in the admin audit log.");
  if (reason.length > 1000) throw new Error("Reason must be 1,000 characters or fewer.");
  return reason;
}

async function writeAudit(admin: any, user: any, values: {
  targetUserId?: string | null; entityType: string; entityId: string; action: string; reason?: string | null;
  previousValues?: unknown; newValues?: unknown;
}) {
  const { error } = await admin.from("admin_management_audit").insert({
    admin_user_id: user.id,
    target_user_id: values.targetUserId ?? null,
    entity_type: values.entityType,
    entity_id: values.entityId,
    action: values.action,
    reason: values.reason ?? null,
    previous_values: values.previousValues ?? null,
    new_values: values.newValues ?? null,
  });
  if (error) throw new Error(`Change was made, but the audit log could not be written: ${error.message}`);
}

export async function GET() {
  const context = await getAdminContext();
  if (isContextError(context)) return context.response;
  const { admin } = context;

  const [profilesResult, clipsResult, campaignsResult, payoutsResult, earningsResult, bonusResult, accountsResult, auditResult] = await Promise.all([
    admin.from("profiles").select("id,user_id,display_name,role,created_at,is_suspended,suspended_at,suspended_by,suspension_reason").order("created_at", { ascending: false }).limit(1000),
    admin.from("clips").select("*").order("submitted_at", { ascending: false }).limit(2000),
    admin.from("campaigns").select("*").order("created_at", { ascending: false }).limit(500),
    admin.from("payout_requests").select("*").order("requested_at", { ascending: false }).limit(1000),
    admin.from("earnings").select("*").order("calculated_at", { ascending: false }).limit(2000),
    admin.from("bonus_claims").select("*").order("requested_at", { ascending: false }).limit(1000),
    admin.from("instagram_accounts").select("id,user_id,handle,is_active").limit(5000),
    admin.from("admin_management_audit").select("*").order("created_at", { ascending: false }).limit(250),
  ]);

  const results = [profilesResult, clipsResult, campaignsResult, payoutsResult, earningsResult, bonusResult, accountsResult, auditResult];
  const warnings = results.filter((r) => r.error).map((r) => r.error.message as string);
  return NextResponse.json({
    data: {
      profiles: profilesResult.data ?? [], clips: clipsResult.data ?? [], campaigns: campaignsResult.data ?? [],
      payouts: payoutsResult.data ?? [], earnings: earningsResult.data ?? [], bonusClaims: bonusResult.data ?? [],
      accounts: accountsResult.data ?? [], auditLogs: auditResult.data ?? [],
    },
    warnings,
    truncated: (clipsResult.data?.length ?? 0) >= 2000 || (profilesResult.data?.length ?? 0) >= 1000,
  });
}

export async function POST(request: Request) {
  const context = await getAdminContext();
  if (isContextError(context)) return context.response;
  const { admin, user } = context;

  try {
    const body = await request.json();
    const action = String(body?.action ?? "");

    if (action === "mark_reviewing_bulk") {
      const rawIds: unknown = body.ids;
      if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 100) {
        throw new Error("Select between 1 and 100 pending Reels at a time.");
      }
      const ids = Array.from(new Set(rawIds.map((value) => String(value ?? "").trim()).filter(Boolean)));
      if (ids.length !== rawIds.length || ids.some((id) => id.length > 100)) {
        throw new Error("The selected Reel list is invalid. Refresh and select them again.");
      }
      const reason = readReason(body.reason ?? "Please update your current Instagram views and likes, then resubmit.");
      const { data: selected, error: selectError } = await admin
        .from("clips")
        .select("id,status,is_removed,user_id,self_reported_views,self_reported_likes")
        .in("id", ids);
      if (selectError) throw new Error(selectError.message);
      if (!selected || selected.length !== ids.length) {
        throw new Error("Some selected Reels could not be found. Refresh the queue and try again.");
      }
      const unavailable = selected.find((clip: any) => clip.status !== "pending" || clip.is_removed);
      if (unavailable) {
        throw new Error("One or more selected Reels are no longer pending or have been removed. Refresh and select the pending Reels again.");
      }

      const { data: updated, error: updateError } = await admin
        .from("clips")
        .update({ status: "reviewing", reviewed_at: null, reviewed_by: null, review_note: reason })
        .in("id", ids)
        .eq("status", "pending")
        .select("id,user_id,self_reported_views,self_reported_likes");
      if (updateError) throw new Error(updateError.message);
      if (!updated || updated.length !== ids.length) {
        throw new Error("The queue changed while processing. Refresh the page to see which Reels still need review.");
      }

      const oldById = new Map((selected as any[]).map((clip) => [clip.id, clip]));
      const auditRows = updated.map((clip: any) => {
        const old = oldById.get(clip.id) as any;
        return {
          admin_user_id: user.id,
          target_user_id: clip.user_id,
          entity_type: "clip",
          entity_id: clip.id,
          action: "mark_reviewing",
          reason,
          previous_values: { status: old?.status ?? "pending", self_reported_views: old?.self_reported_views ?? 0, self_reported_likes: old?.self_reported_likes ?? 0 },
          new_values: { status: "reviewing" },
        };
      });
      const { error: auditError } = await admin.from("admin_management_audit").insert(auditRows);
      if (auditError) throw new Error(`Reels were sent for review, but the audit log could not be written: ${auditError.message}`);
      revalidatePath("/admin/clips");
      revalidatePath("/dashboard/clips");
      revalidatePath("/dashboard");

      return NextResponse.json({ ok: true, count: updated.length, message: `${updated.length} Reel(s) sent to clippers for updated views and likes.` });
    }

    if (action === "mark_reviewing") {
      const id = String(body.id ?? "").trim();
      const reason = readReason(body.reason ?? "Admin requested updated clip metrics");
      if (!id) throw new Error("Clip ID is required.");
      const { data: clip, error: clipError } = await admin.from("clips").select("*").eq("id", id).maybeSingle();
      if (clipError) throw new Error(clipError.message);
      if (!clip) return NextResponse.json({ error: "Clip not found." }, { status: 404 });
      if (clip.is_removed) throw new Error("Restore this clip before requesting updated metrics.");
      if (!["pending", "reviewing", "approved"].includes(clip.status)) throw new Error("Only pending, reviewing, or approved clips can be sent for updated metrics.");
      const previous = { status: clip.status, self_reported_views: clip.self_reported_views ?? 0, self_reported_likes: clip.self_reported_likes ?? 0 };
      const { data: updated, error: updateError } = await admin.from("clips").update({ status: "reviewing", reviewed_at: null, reviewed_by: null, review_note: reason }).eq("id", id).select("*").single();
      if (updateError) throw new Error(updateError.message);
      await writeAudit(admin, user, { entityType: "clip", entityId: id, targetUserId: clip.user_id, action: "mark_reviewing", reason, previousValues: previous, newValues: { status: "reviewing" } });
      revalidatePath("/admin/clips");
      revalidatePath("/dashboard/clips");
      revalidatePath("/dashboard");
      return NextResponse.json({ ok: true, message: "Clipper can now submit updated views and likes for this Reel.", clip: updated });
    }

    if (action === "edit_clip") {
      const id = String(body.id ?? "").trim();
      const reason = readReason(body.reason);
      if (!id) throw new Error("Clip ID is required.");
      const { data: clip, error: clipError } = await admin.from("clips").select("*").eq("id", id).maybeSingle();
      if (clipError) throw new Error(clipError.message);
      if (!clip) return NextResponse.json({ error: "Clip not found." }, { status: 404 });
      if (clip.is_removed) throw new Error("Restore this clip before editing it.");

      const patch: Record<string, unknown> = {};
      if (body.selfReportedViews !== undefined) patch.self_reported_views = readCount(body.selfReportedViews, "Reported views");
      if (body.selfReportedLikes !== undefined) patch.self_reported_likes = readCount(body.selfReportedLikes, "Reported likes");
      if (body.reviewNote !== undefined) {
        const reviewNote = String(body.reviewNote ?? "").trim();
        if (reviewNote.length > 2000) throw new Error("Admin note must be 2,000 characters or fewer.");
        patch.review_note = reviewNote || null;
      }
      if (body.instagramUrl !== undefined) {
        const urlText = String(body.instagramUrl ?? "").trim();
        let url: URL;
        try { url = new URL(urlText); } catch { throw new Error("Enter a valid Instagram Reel URL."); }
        if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com", "m.instagram.com"].includes(url.hostname.toLowerCase()) || !/^\/(reel|reels|p)\/[A-Za-z0-9_-]+\/?$/i.test(url.pathname)) {
          throw new Error("Enter a valid HTTPS Instagram Reel URL.");
        }
        patch.instagram_url = `https://www.instagram.com${url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`}`;
        const match = url.pathname.match(/^\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i);
        if (match) patch.shortcode = match[1];
      }

      let nextEligibleViews: number | null = null;
      if (body.eligibleViews !== undefined && body.eligibleViews !== null && body.eligibleViews !== "") {
        if (clip.status !== "approved") throw new Error("Eligible views can only be edited for an approved clip.");
        nextEligibleViews = readCount(body.eligibleViews, "Verified eligible views");
        patch.eligible_views = nextEligibleViews;
      }
      if (!Object.keys(patch).length) throw new Error("No changes were provided.");
      const previous = {
        instagram_url: clip.instagram_url,
        self_reported_views: clip.self_reported_views ?? 0,
        self_reported_likes: clip.self_reported_likes ?? 0,
        eligible_views: clip.eligible_views ?? 0,
        review_note: clip.review_note ?? null,
      };

      const { data: updated, error: updateError } = await admin.from("clips").update(patch).eq("id", id).select("*").single();
      if (updateError) throw new Error(updateError.message);

      if (nextEligibleViews !== null) {
        const { error: earningError } = await admin.rpc("admin_update_approved_clip_views", {
          p_clip_id: id,
          p_eligible_views: nextEligibleViews,
          p_admin_user_id: user.id,
          p_reason: reason,
        });
        if (earningError) {
          await admin.from("clips").update({ eligible_views: clip.eligible_views }).eq("id", id);
          throw new Error(`Could not update eligible views and wallet ledger; the previous clip view count was restored. ${earningError.message}`);
        }
      }
      await writeAudit(admin, user, { entityType: "clip", entityId: id, targetUserId: clip.user_id, action: "edit_clip", reason, previousValues: previous, newValues: { ...previous, ...patch } });
      return NextResponse.json({ ok: true, message: "Clip updated and change recorded in the admin audit log.", clip: updated });
    }

    if (action === "remove_clip" || action === "restore_clip") {
      const id = String(body.id ?? "").trim();
      const reason = readReason(body.reason);
      if (!id) throw new Error("Clip ID is required.");
      const removing = action === "remove_clip";
      const { data: result, error: transitionError } = await admin.rpc("admin_toggle_clip_removal", {
        p_clip_id: id,
        p_remove: removing,
        p_admin_user_id: user.id,
        p_reason: reason,
      });
      if (transitionError) throw new Error(transitionError.message);
      const resultObject = (result ?? {}) as Record<string, any>;
      return NextResponse.json({
        ok: true,
        message: resultObject.message || (removing ? "Clip removed and earning reversal recorded." : "Clip restored and earning recalculated."),
        ...resultObject,
      });
    }

    if (action === "suspend_clipper" || action === "restore_clipper") {
      const targetUserId = String(body.userId ?? "").trim();
      const reason = readReason(body.reason);
      if (!targetUserId) throw new Error("Clipper user ID is required.");
      if (targetUserId === user.id) throw new Error("You cannot suspend your own admin account.");
      const { data: profile, error: profileError } = await admin.from("profiles").select("user_id,role,display_name,is_suspended,suspension_reason").eq("user_id", targetUserId).maybeSingle();
      if (profileError) throw new Error(profileError.message);
      if (!profile || profile.role !== "clipper") throw new Error("Only a clipper account can be suspended or restored.");
      const suspending = action === "suspend_clipper";
      if (Boolean(profile.is_suspended) === suspending) throw new Error(suspending ? "This clipper is already suspended." : "This clipper is not suspended.");

      const { error: authAdminError } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: suspending ? "876000h" : "none" });
      if (authAdminError) throw new Error(`Supabase Auth could not update this account: ${authAdminError.message}`);
      const profilePatch = suspending
        ? { is_suspended: true, suspended_at: new Date().toISOString(), suspended_by: user.id, suspension_reason: reason }
        : { is_suspended: false, suspended_at: null, suspended_by: null, suspension_reason: null };
      const { error: updateError } = await admin.from("profiles").update(profilePatch).eq("user_id", targetUserId);
      if (updateError) {
        await admin.auth.admin.updateUserById(targetUserId, { ban_duration: suspending ? "none" : "876000h" });
        throw new Error(updateError.message);
      }
      await writeAudit(admin, user, {
        entityType: "clipper", entityId: targetUserId, targetUserId, action, reason,
        previousValues: { is_suspended: profile.is_suspended, suspension_reason: profile.suspension_reason },
        newValues: { is_suspended: suspending, suspension_reason: suspending ? reason : null },
      });
      return NextResponse.json({ ok: true, message: suspending ? "Clipper suspended. Their existing clips and financial history were preserved." : "Clipper access restored." });
    }

    return NextResponse.json({ error: "Unknown admin action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
