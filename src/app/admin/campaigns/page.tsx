'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  getAllCampaignsAction,
  createCampaignAction,
  updateCampaignAction,
} from '@/actions/campaigns';
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import {
  FolderKanban,
  PlusCircle,
  Calendar,
  DollarSign,
  Film,
  Eye,
  CheckCircle2,
  Loader2,
  Edit,
  Power,
} from 'lucide-react';
import type { Campaign } from '@/lib/types';

type CampaignWithStats = Campaign & {
  totalClips: number;
  approvedClips: number;
  totalEligibleViews: number;
  totalEarnings: number;
};

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadCampaigns() {
    setLoading(true);
    const res = await getAllCampaignsAction();
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      setCampaigns(res.campaigns);
    }
  }

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.currentTarget);

    let res;
    if (editingCampaign) {
      res = await updateCampaignAction(editingCampaign.id, formData);
    } else {
      res = await createCampaignAction(formData);
    }

    setSubmitting(false);

    if (!res.success) {
      toast.error(res.error || 'Failed to save campaign');
    } else {
      toast.success(
        editingCampaign
          ? 'Campaign updated successfully!'
          : 'Campaign created successfully!'
      );
      setModalOpen(false);
      setEditingCampaign(null);
      loadCampaigns();
    }
  }

  async function handleToggleActive(campaign: Campaign) {
    const formData = new FormData();
    formData.append('name', campaign.name);
    formData.append('description', campaign.description || '');
    formData.append('ratePer1000', campaign.rate_per_1000.toString());
    formData.append('startDate', campaign.start_date);
    formData.append('endDate', campaign.end_date);
    formData.append('isActive', (!campaign.is_active).toString());

    const res = await updateCampaignAction(campaign.id, formData);
    if (!res.success) {
      toast.error(res.error || 'Failed to toggle status');
    } else {
      toast.success(
        `Campaign ${!campaign.is_active ? 'activated' : 'paused'}!`
      );
      loadCampaigns();
    }
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Campaign Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure clipping campaigns, rate per 1,000 views, and active date schedules.
          </p>
        </div>

        <Dialog
          open={modalOpen}
          onOpenChange={(open) => {
            setModalOpen(open);
            if (!open) setEditingCampaign(null);
          }}
        >
          <DialogTrigger asChild>
            <Button
              className="gap-2"
              onClick={() => {
                setEditingCampaign(null);
                setModalOpen(true);
              }}
            >
              <PlusCircle className="h-4 w-4" />
              New Campaign
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingCampaign ? 'Edit Campaign' : 'Create New Campaign'}
              </DialogTitle>
              <DialogDescription>
                Define the campaign rates and submission timeline.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Campaign Name</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder="e.g., Summer Viral Reels"
                  defaultValue={editingCampaign?.name || ''}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  name="description"
                  placeholder="Brand details or content guidelines"
                  defaultValue={editingCampaign?.description || ''}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ratePer1000">Fixed Rate per 1,000 Views (INR)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="ratePer1000"
                    name="ratePer1000"
                    type="number"
                    step="0.01"
                    min="0.10"
                    required
                    placeholder="2.50"
                    className="pl-9 font-mono"
                    defaultValue={editingCampaign?.rate_per_1000 || ''}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    name="startDate"
                    type="date"
                    required
                    defaultValue={
                      editingCampaign?.start_date ||
                      new Date().toISOString().split('T')[0]
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    name="endDate"
                    type="date"
                    required
                    defaultValue={
                      editingCampaign?.end_date ||
                      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                        .toISOString()
                        .split('T')[0]
                    }
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  name="isActive"
                  defaultChecked={editingCampaign ? editingCampaign.is_active : true}
                  className="rounded border-input text-primary focus:ring-ring"
                />
                <Label htmlFor="isActive" className="text-sm font-normal cursor-pointer">
                  Campaign is active and accepting submissions
                </Label>
              </div>

              <DialogFooter className="pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : editingCampaign ? (
                    'Update Campaign'
                  ) : (
                    'Create Campaign'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-20 flex justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <FolderKanban className="h-10 w-10 text-muted-foreground mx-auto opacity-30" />
              <p className="font-semibold text-foreground">No campaigns created yet</p>
              <p className="text-xs text-muted-foreground">
                Create your first brand campaign to start accepting clips from creators.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-xs text-muted-foreground uppercase tracking-wider bg-muted/20">
                    <th className="py-3 px-4 font-medium">Campaign</th>
                    <th className="py-3 px-4 font-medium">Rate / 1k Views</th>
                    <th className="py-3 px-4 font-medium">Timeline</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Clips</th>
                    <th className="py-3 px-4 font-medium">Total Views</th>
                    <th className="py-3 px-4 font-medium">Total Earnings</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {campaigns.map((camp) => {
                    const isExpired = today > camp.end_date;
                    return (
                      <tr key={camp.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-4 px-4">
                          <div>
                            <span className="font-semibold text-foreground">
                              {camp.name}
                            </span>
                            {camp.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                                {camp.description}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="py-4 px-4 font-mono font-bold text-primary">
                          {formatCurrency(camp.rate_per_1000)}
                        </td>

                        <td className="py-4 px-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {formatDate(camp.start_date)} - {formatDate(camp.end_date)}
                            </span>
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          {isExpired ? (
                            <Badge variant="secondary" className="text-[10px]">
                              Expired
                            </Badge>
                          ) : camp.is_active ? (
                            <Badge variant="success" className="text-[10px]">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              Paused
                            </Badge>
                          )}
                        </td>

                        <td className="py-4 px-4">
                          <div className="flex items-center gap-1.5 text-xs">
                            <Film className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-semibold">{camp.totalClips}</span>
                            <span className="text-muted-foreground text-[11px]">
                              ({camp.approvedClips} approved)
                            </span>
                          </div>
                        </td>

                        <td className="py-4 px-4 font-semibold text-xs text-foreground">
                          {formatNumber(camp.totalEligibleViews)}
                        </td>

                        <td className="py-4 px-4 font-bold font-mono text-xs text-foreground">
                          {formatCurrency(camp.totalEarnings)}
                        </td>

                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Toggle Active/Paused"
                              onClick={() => handleToggleActive(camp)}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            >
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Edit Campaign"
                              onClick={() => {
                                setEditingCampaign(camp);
                                setModalOpen(true);
                              }}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
