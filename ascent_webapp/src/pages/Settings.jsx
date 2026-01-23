import React, { useState, useEffect } from 'react';
import { ascent } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, User, Mail, Shield, Bell, Globe, Eye, EyeOff } from 'lucide-react';
import ImportExportSection from '../components/settings/ImportExportSection';
import SharedUsersSection from '../components/settings/SharedUsersSection';
import InviteUserDialog from '../components/settings/InviteUserDialog';
import CardManagement from '../components/settings/CardManagement';
import { useTheme } from '../components/ThemeProvider';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function Settings() {
  const { user: themeUser, theme, colors, t, loading: themeLoading, updateUserLocal, refreshUser } = useTheme();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (themeUser) {
      setUser(themeUser);
      setIsLoading(false);
    }
  }, [themeUser]);

  const updateUserMutation = useMutation({
    mutationFn: async (data) => {
      // Update locally first for instant feedback
      updateUserLocal(data);
      setUser(prev => ({ ...prev, ...data }));
      // Then persist to server
      return ascent.auth.updateMe(data);
    },
    onSuccess: async () => {
      // Refresh to ensure we have the latest from server
      await refreshUser();
      queryClient.invalidateQueries();
      toast.success('Settings updated!');
    },
    onError: async (error) => {
      console.error('Update error:', error);
      // Revert on error by refreshing from server
      await refreshUser();
      toast.error('Failed to update settings');
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Account.filter({ created_by: user.email });
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: positions = [] } = useQuery({
    queryKey: ['positions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Position.list('-created_date', 1000);
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.ExpenseTransaction.filter({ created_by: user.email }, '-date', 1000);
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: sharedUsers = [] } = useQuery({
    queryKey: ['sharedUsers', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.SharedUser.filter({ created_by: user.email }, '-created_date');
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: myPermissions } = useQuery({
    queryKey: ['myPermissions', user?.email],
    queryFn: async () => {
      if (!user) return null;
      const shared = await ascent.entities.SharedUser.filter({ invitedEmail: user.email, status: 'accepted' });
      return shared[0]?.permissions || null;
    },
    enabled: !!user,
  });

  const inviteUserMutation = useMutation({
    mutationFn: async (data) => {
      const invitation = await ascent.entities.SharedUser.create(data);
      await ascent.integrations.Core.SendEmail({
        to: data.invitedEmail,
        subject: `You've been invited to Ascend by ${user.full_name}`,
        body: `Hello ${data.displayName},\n\n${user.full_name} has invited you to collaborate on their Ascend account.\n\nYou can access the account at: ${window.location.origin}\n\nBest regards,\nAscend Team`
      });
      return invitation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sharedUsers'] });
      setInviteDialogOpen(false);
      toast.success('Invitation sent successfully!');
    },
    onError: () => {
      toast.error('Failed to send invitation');
    },
  });

  const updateSharedUserMutation = useMutation({
    mutationFn: ({ id, data }) => ascent.entities.SharedUser.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sharedUsers'] });
      toast.success('Permissions updated!');
    },
  });

  const deleteSharedUserMutation = useMutation({
    mutationFn: (id) => ascent.entities.SharedUser.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sharedUsers'] });
      toast.success('User access revoked!');
    },
  });

  if (isLoading || themeLoading) {
    return (
      <div className={cn("flex items-center justify-center min-h-screen", colors.bgPrimary)}>
        <Loader2 className={cn("w-8 h-8 animate-spin", colors.accentText)} />
      </div>
    );
  }

  return (
    <div className={cn("p-4 md:p-8", colors.bgPrimary)}>
      <div className="max-w-4xl mx-auto py-4">
        <div className="mb-6">
          <h1 className={cn("text-3xl md:text-4xl font-bold mb-2", colors.textPrimary)}>{t('settings')}</h1>
          <p className={colors.textTertiary}>{t('manageAccountPreferences')}</p>
        </div>

        <div className="space-y-4">
          {/* Grid for compact cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Profile Information */}
          <Card className={cn(colors.cardBg, colors.cardBorder)}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-[#5C8374]" />
                <CardTitle className={colors.accentText}>{t('profileInformation')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className={colors.textSecondary}>{t('fullName')}</Label>
                <Input
                  value={user?.full_name || ''}
                  disabled
                  className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
                />
              </div>
              <div className="space-y-2">
                <Label className={colors.textSecondary}>{t('email')}</Label>
                <div className="flex items-center gap-2">
                  <Mail className={cn("w-4 h-4", colors.textTertiary)} />
                  <Input
                    value={user?.email || ''}
                    disabled
                    className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className={colors.textSecondary}>{t('role')}</Label>
                <div className="flex items-center gap-2">
                  <Shield className={cn("w-4 h-4", colors.textTertiary)} />
                  <Input
                    value={user?.role || 'user'}
                    disabled
                    className={cn(colors.bgTertiary, colors.border, colors.textPrimary, "capitalize")}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Preferences */}
          <Card className={cn(colors.cardBg, colors.cardBorder)}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-[#5C8374]" />
                <CardTitle className={colors.accentText}>{t('preferences')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={cn("flex items-center justify-between py-3 border-b", colors.borderLight)}>
                <div>
                  <p className={cn("font-medium", colors.textPrimary)}>{t('language')}</p>
                  <p className={cn("text-sm", colors.textTertiary)}>{t('displayLanguage')}</p>
                </div>
                <Select
                  value={user?.language || 'en'}
                  onValueChange={(value) => updateUserMutation.mutate({ language: value })}
                >
                  <SelectTrigger className={cn("w-[140px]", colors.bgTertiary, colors.border, colors.textPrimary)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                    <SelectItem value="en" className={colors.textPrimary}>English</SelectItem>
                    <SelectItem value="he" className={colors.textPrimary}>עברית</SelectItem>
                    <SelectItem value="ru" className={colors.textPrimary}>Русский</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className={cn("flex items-center justify-between py-3 border-b", colors.borderLight)}>
                <div>
                  <p className={cn("font-medium", colors.textPrimary)}>{t('defaultCurrency')}</p>
                  <p className={cn("text-sm", colors.textTertiary)}>{t('primaryCurrencyForPortfolio')}</p>
                </div>
                <Select
                  value={user?.currency || 'USD'}
                  onValueChange={(value) => updateUserMutation.mutate({ currency: value })}
                >
                  <SelectTrigger className={cn("w-[140px]", colors.bgTertiary, colors.border, colors.textPrimary)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                    <SelectItem value="USD" className={colors.textPrimary}>USD ($)</SelectItem>
                    <SelectItem value="EUR" className={colors.textPrimary}>EUR (€)</SelectItem>
                    <SelectItem value="GBP" className={colors.textPrimary}>GBP (£)</SelectItem>
                    <SelectItem value="ILS" className={colors.textPrimary}>ILS (₪)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className={cn("font-medium", colors.textPrimary)}>{t('theme')}</p>
                  <p className={cn("text-sm", colors.textTertiary)}>{t('appColorScheme')}</p>
                </div>
                <Select
                  value={user?.theme || 'dark'}
                  onValueChange={(value) => updateUserMutation.mutate({ theme: value })}
                >
                  <SelectTrigger className={cn("w-[140px]", colors.bgTertiary, colors.border, colors.textPrimary)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                    <SelectItem value="dark" className={colors.textPrimary}>{t('dark')}</SelectItem>
                    <SelectItem value="light" className={colors.textPrimary}>{t('light')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Privacy */}
          <Card className={cn(colors.cardBg, colors.cardBorder)}>
            <CardHeader>
              <div className="flex items-center gap-3">
                {user?.blurValues ? <EyeOff className="w-5 h-5 text-[#5C8374]" /> : <Eye className="w-5 h-5 text-[#5C8374]" />}
                <CardTitle className={colors.accentText}>{t('privacy')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between py-3">
                <div className="flex-1">
                  <p className={cn("font-medium", colors.textPrimary)}>{t('blurFinancialValues')}</p>
                  <p className={cn("text-sm", colors.textTertiary)}>{t('hideAmountsWhenShowing')}</p>
                </div>
                <Switch
                  checked={user?.blurValues || false}
                  onCheckedChange={(checked) => updateUserMutation.mutate({ blurValues: checked })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card className={cn(colors.cardBg, colors.cardBorder)}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-[#5C8374]" />
                <CardTitle className={colors.accentText}>{t('notifications')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className={cn("flex items-center justify-between py-3 border-b", colors.borderLight)}>
                  <div>
                    <p className={cn("font-medium", colors.textPrimary)}>{t('priceAlerts')}</p>
                    <p className={cn("text-sm", colors.textTertiary)}>{t('getNotifiedPriceChanges')}</p>
                  </div>
                  <Switch
                    checked={user?.priceAlerts || false}
                    onCheckedChange={(checked) => updateUserMutation.mutate({ priceAlerts: checked })}
                  />
                </div>
                <div className={cn("flex items-center justify-between py-3 border-b", colors.borderLight)}>
                  <div>
                    <p className={cn("font-medium", colors.textPrimary)}>{t('weeklySummary')}</p>
                    <p className={cn("text-sm", colors.textTertiary)}>{t('receiveWeeklyReports')}</p>
                  </div>
                  <Switch
                    checked={user?.weeklyReports !== false}
                    onCheckedChange={(checked) => updateUserMutation.mutate({ weeklyReports: checked })}
                  />
                </div>
                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className={cn("font-medium", colors.textPrimary)}>{t('emailNotifications')}</p>
                    <p className={cn("text-sm", colors.textTertiary)}>{t('receiveImportantUpdates')}</p>
                  </div>
                  <Switch
                    checked={user?.emailNotifications !== false}
                    onCheckedChange={(checked) => updateUserMutation.mutate({ emailNotifications: checked })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          </div>

          {/* Card Management */}
          <CardManagement user={user} />

          {/* Shared Access */}
          <SharedUsersSection
            sharedUsers={sharedUsers}
            onInvite={() => setInviteDialogOpen(true)}
            onUpdate={(id, data) => updateSharedUserMutation.mutate({ id, data })}
            onDelete={deleteSharedUserMutation.mutate}
            canManageUsers={!myPermissions || myPermissions.manageUsers}
          />

          {/* Import/Export */}
          <ImportExportSection
            accounts={accounts}
            positions={positions}
            transactions={transactions}
          />

          {/* Invite User Dialog */}
          <InviteUserDialog
            open={inviteDialogOpen}
            onClose={() => setInviteDialogOpen(false)}
            onSubmit={inviteUserMutation.mutate}
            isLoading={inviteUserMutation.isPending}
          />

          {/* Branding */}
          <Card className={cn(colors.cardBg, colors.cardBorder)}>
            <CardContent className="p-6">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <img 
                    src={theme === 'dark' 
                      ? "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693973feb6a9cd11c10d222b/c7a1d13e4_ascend_darkmode_logo.png"
                      : "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693973feb6a9cd11c10d222b/da2eb9289_acseend_ver1.png"
                    }
                    alt="Ascend Logo" 
                    className="w-24 h-24 object-contain"
                    style={{ filter: 'brightness(1.1) saturate(1.2)' }}
                  />
                </div>
                <p className={cn("text-sm", colors.textSecondary)}>{t('ascendTagline')}</p>
                <p className={cn("text-xs mt-2", colors.textTertiary)}>v1.0.0</p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="h-16 md:h-8"></div>
      </div>
    </div>
  );
}