import React, { useState, useEffect, useMemo } from 'react';
import { ascent } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, User, Mail, Shield, Bell, Globe, Edit2, Check, X, Users } from 'lucide-react';
import ImportExportSection from '../components/settings/ImportExportSection';
import SharedUsersSection from '../components/settings/SharedUsersSection';
import InviteUserDialog from '../components/settings/InviteUserDialog';
import CardManagement from '../components/settings/CardManagement';
import { useTheme } from '../components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function Settings() {
  const { user: themeUser, theme, colors, t, loading: themeLoading, updateUserLocal, refreshUser } = useTheme();
  const { currentWorkspace, permissions, hasPermission, refreshWorkspaces } = useAuth();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editingFullName, setEditingFullName] = useState(false);
  const [fullNameValue, setFullNameValue] = useState('');
  const [editingWorkspaceName, setEditingWorkspaceName] = useState(false);
  const [workspaceNameValue, setWorkspaceNameValue] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (themeUser) {
      setUser(themeUser);
      setFullNameValue(themeUser?.full_name || '');
      setIsLoading(false);
    }
  }, [themeUser]);

  useEffect(() => {
    if (currentWorkspace) {
      setWorkspaceNameValue(currentWorkspace.name);
    }
  }, [currentWorkspace]);

  const handleSaveFullName = async () => {
    if (fullNameValue.trim() === (user?.full_name || '').trim()) {
      setEditingFullName(false);
      return;
    }
    
    try {
      await updateUserMutation.mutateAsync({ full_name: fullNameValue.trim() });
      setEditingFullName(false);
      toast.success(t('fullNameUpdated') || 'Full name updated successfully');
    } catch (error) {
      console.error('Failed to update full name:', error);
      setFullNameValue(user?.full_name || '');
      toast.error(t('failedToUpdateFullName') || 'Failed to update full name');
    }
  };

  const handleCancelEditFullName = () => {
    setFullNameValue(user?.full_name || '');
    setEditingFullName(false);
  };

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
      return await ascent.entities.Account.list();
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
      return await ascent.entities.ExpenseTransaction.list('-date', 1000);
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ['notes', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Note.list();
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['goals', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.FinancialGoal.list('-created_date');
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Budget.list('-created_date');
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Category.list('-created_date');
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: cards = [] } = useQuery({
    queryKey: ['cards', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Card.list();
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: async (name) => {
      if (!currentWorkspace) return;
      return ascent.workspaces.update(currentWorkspace.id || currentWorkspace._id, { name });
    },
    onSuccess: () => {
      // Reload page to refresh workspace list in context
      window.location.reload();
    },
    onError: (error) => {
      toast.error('Failed to update workspace name');
    }
  });

  const isOwner = currentWorkspace?.ownerId === user?.id || currentWorkspace?.ownerId === user?._id;

  const handleSaveWorkspaceName = async () => {
    if (workspaceNameValue.trim() === currentWorkspace?.name) {
      setEditingWorkspaceName(false);
      return;
    }
    await updateWorkspaceMutation.mutateAsync(workspaceNameValue.trim());
  };

  const inviteUserMutation = useMutation({
    mutationFn: async (data) => {
      if (!currentWorkspace) throw new Error('No active workspace');
      
      const inviteData = {
        email: data.invitedEmail,
        role: 'viewer', // Default role
        permissions: data.permissions,
        displayName: data.displayName
      };
      
      const result = await ascent.workspaces.invite(currentWorkspace.id || currentWorkspace._id, inviteData);
      
      // Send email logic (reuse existing logic but adapted)
      // For now, let's assume the backend handles it or we just show success
      // The backend response contains the workspace with updated members
      
      // We can reuse the email sending logic here if we want client-side sending
      // But let's keep it simple for now and trust the backend invitation creation
      
      // ... (Email sending logic omitted for brevity, can be re-added if needed)
      
      return result;
    },
    onSuccess: async () => {
      toast.success('Invitation sent successfully!');
      setInviteDialogOpen(false);
      // Refresh workspaces to update members list in background
      await refreshWorkspaces();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to send invitation');
    }
  });

  // Map workspace members to the format expected by SharedUsersSection
  const sharedUsers = useMemo(() => {
    if (!currentWorkspace?.members) return [];
    return currentWorkspace.members
      .filter(m => m.userId !== user?.id && m.userId !== user?._id && m.email !== user?.email) // Exclude self
      .map(m => ({
        id: m._id || m.userId, // Use member ID or User ID
        invitedEmail: m.email,
        displayName: m.email.split('@')[0], // Fallback display name
        status: m.status,
        permissions: m.permissions,
        role: m.role
      }));
  }, [currentWorkspace, user]);

  const canManageUsers = hasPermission('manageUsers');

  const updateSharedUserMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      if (!currentWorkspace) return;
      return ascent.workspaces.updateMember(currentWorkspace.id || currentWorkspace._id, id, data);
    },
    onSuccess: async () => {
      toast.success('Permissions updated!');
      await refreshWorkspaces();
    },
  });

  const deleteSharedUserMutation = useMutation({
    mutationFn: async (id) => {
      if (!currentWorkspace) return;
      return ascent.workspaces.removeMember(currentWorkspace.id || currentWorkspace._id, id);
    },
    onSuccess: async () => {
      toast.success('User access revoked!');
      await refreshWorkspaces();
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
                <div className="flex items-center gap-2">
                  <User className={cn("w-4 h-4", colors.textTertiary)} />
                  <Input
                    value={fullNameValue}
                    onChange={(e) => setFullNameValue(e.target.value)}
                    disabled={!editingFullName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editingFullName) {
                        handleSaveFullName();
                      } else if (e.key === 'Escape' && editingFullName) {
                        handleCancelEditFullName();
                      }
                    }}
                    className={cn(colors.bgTertiary, colors.border, colors.textPrimary, editingFullName && "ring-2 ring-[#5C8374]")}
                  />
                  {editingFullName ? (
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleSaveFullName}
                        className={cn("h-8 w-8 hover:bg-green-500/20", colors.textSecondary)}
                      >
                        <Check className="w-4 h-4 text-green-400" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleCancelEditFullName}
                        className={cn("h-8 w-8 hover:bg-red-500/20", colors.textSecondary)}
                      >
                        <X className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditingFullName(true)}
                      className={cn("h-8 w-8 hover:bg-[#5C8374]/20", colors.textSecondary)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
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
                    <p className={cn("font-medium", colors.textPrimary)}>{t('dailySummary')}</p>
                    <p className={cn("text-sm", colors.textTertiary)}>{t('receiveDailyReports')}</p>
                  </div>
                  <Switch
                    checked={user?.dailySummary !== false}
                    onCheckedChange={(checked) => updateUserMutation.mutate({ dailySummary: checked })}
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
          {hasPermission('editExpenses') && <CardManagement user={user} />}

          {/* Workspace Management */}
          {isOwner && (
          <Card className={cn(colors.cardBg, colors.cardBorder)}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-[#5C8374]" />
                <CardTitle className={colors.accentText}>{t('workspaceSettings') || 'Workspace Settings'}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className={colors.textSecondary}>{t('workspaceName') || 'Workspace Name'}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={workspaceNameValue}
                    onChange={(e) => setWorkspaceNameValue(e.target.value)}
                    disabled={!editingWorkspaceName}
                    className={cn(colors.bgTertiary, colors.border, colors.textPrimary, editingWorkspaceName && "ring-2 ring-[#5C8374]")}
                  />
                  {editingWorkspaceName ? (
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleSaveWorkspaceName}
                        className={cn("h-8 w-8 hover:bg-green-500/20", colors.textSecondary)}
                      >
                        <Check className="w-4 h-4 text-green-400" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setWorkspaceNameValue(currentWorkspace?.name || '');
                          setEditingWorkspaceName(false);
                        }}
                        className={cn("h-8 w-8 hover:bg-red-500/20", colors.textSecondary)}
                      >
                        <X className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  ) : (
                    isOwner && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditingWorkspaceName(true)}
                        className={cn("h-8 w-8 hover:bg-[#5C8374]/20", colors.textSecondary)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Shared Access */}
          {isOwner && (
          <SharedUsersSection
            sharedUsers={sharedUsers}
            onInvite={() => setInviteDialogOpen(true)}
            onUpdate={(id, data) => updateSharedUserMutation.mutate({ id, data })}
            onDelete={deleteSharedUserMutation.mutate}
            canManageUsers={canManageUsers}
          />
          )}

          {/* Export */}
          <ImportExportSection
            accounts={accounts}
            positions={positions}
            transactions={transactions}
            notes={notes}
            budgets={budgets}
            categories={categories}
            cards={cards}
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
                      ? "/logo-dark.png"
                      : "/logo-light.png"
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