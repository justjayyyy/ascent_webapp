import React, { useState, useEffect } from 'react';
import { ascent } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, User, Mail, Shield, Bell, Globe, Eye, EyeOff, Edit2, Check, X } from 'lucide-react';
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
  const [editingFullName, setEditingFullName] = useState(false);
  const [fullNameValue, setFullNameValue] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (themeUser) {
      setUser(themeUser);
      setFullNameValue(themeUser?.full_name || '');
      setIsLoading(false);
    }
  }, [themeUser]);

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

  const { data: notes = [] } = useQuery({
    queryKey: ['notes', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Note.filter({ created_by: user.email });
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['goals', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.FinancialGoal.filter({ created_by: user.email }, '-created_date');
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Budget.filter({ created_by: user.email }, '-created_date');
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
      return await ascent.entities.Card.filter({ created_by: user.email });
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
      
      // First check if user is owner (has created SharedUser records)
      const owned = await ascent.entities.SharedUser.filter({ created_by: user.email });
      if (owned.length > 0) {
        // User is owner, return null (no permission restrictions)
        return null;
      }
      
      // Otherwise check if user was invited (shared user)
      const shared = await ascent.entities.SharedUser.filter({ invitedEmail: user.email, status: 'accepted' });
      return shared[0]?.permissions || null;
    },
    enabled: !!user,
  });

  const inviteUserMutation = useMutation({
    mutationFn: async (data) => {
      const invitation = await ascent.entities.SharedUser.create({
        ...data,
        created_by: user.email
      });
      
      // Get invitation token (the _id)
      const invitationToken = invitation.id || invitation._id;
      // Send email asynchronously (don't wait for it)
      const sendEmailAsync = async () => {
        try {
          const appUrl = window.location.origin;
          const invitationLink = `${appUrl}/accept-invitation/${invitationToken}`;
          const permissionsList = [];
          
          if (data.permissions.viewPortfolio) permissionsList.push('• View Portfolio - See investment accounts and positions');
          if (data.permissions.editPortfolio) permissionsList.push('• Edit Portfolio - Add, edit, and delete accounts and positions');
          if (data.permissions.viewExpenses) permissionsList.push('• View Expenses - See income and expense transactions');
          if (data.permissions.editExpenses) permissionsList.push('• Edit Expenses - Add, edit, and delete transactions');
          if (data.permissions.viewNotes) permissionsList.push('• View Notes - See notes and personal memos');
          if (data.permissions.editNotes) permissionsList.push('• Edit Notes - Create, edit, and delete notes');
          if (data.permissions.viewGoals) permissionsList.push('• View Goals - See financial goals and progress');
          if (data.permissions.editGoals) permissionsList.push('• Edit Goals - Create, edit, and delete financial goals');
          if (data.permissions.viewBudgets) permissionsList.push('• View Budgets - See budget categories and limits');
          if (data.permissions.editBudgets) permissionsList.push('• Edit Budgets - Create, edit, and delete budgets');
          if (data.permissions.viewSettings) permissionsList.push('• View Settings - Access settings page');
          if (data.permissions.manageUsers) permissionsList.push('• Manage Users - Invite and manage other users');
          
          const permissionsText = permissionsList.length > 0 
            ? `\n\nYour Permissions:\n${permissionsList.join('\n')}`
            : '\n\nYou have view-only access to the portfolio.';
          
          const emailBody = `Hello ${data.displayName},

${user.full_name} has invited you to collaborate on their Ascent financial account.

📧 Your Account:
• Email: ${data.invitedEmail}
• Display Name: ${data.displayName}

🔗 Accept Your Invitation:
Click the link below to sign in with Google and accept this invitation:
${invitationLink}

You must sign in with ${data.invitedEmail} to accept this invitation.

${permissionsText}

📝 What is Ascent?
Ascent is a comprehensive personal finance management application that helps you track:
• Investment portfolios and positions
• Income and expenses
• Financial goals and budgets
• Personal notes and memos

🔐 Getting Started:
1. Click the invitation link above
2. Sign in with Google using your email address (${data.invitedEmail})
3. Your invitation will be automatically accepted and you'll have access to the account

💡 Need Help?
If you have any questions or need assistance, please contact ${user.full_name} at ${user.email}.

Best regards,
Ascent Team

---
This is an automated invitation email. Please do not reply to this email.`;

          const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation to Ascent</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #092635 0%, #1B4242 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: #9EC8B9; margin: 0; font-size: 28px;">You've Been Invited to Ascent</h1>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0; border-top: none;">
    <p style="font-size: 16px; margin-top: 0;">Hello <strong>${data.displayName}</strong>,</p>
    
    <p style="font-size: 16px;">
      <strong>${user.full_name}</strong> has invited you to collaborate on their Ascent financial account.
    </p>
    
    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #5C8374;">
      <h2 style="color: #092635; margin-top: 0; font-size: 18px;">📧 Your Account Details</h2>
      <p style="margin: 5px 0;"><strong>Email:</strong> ${data.invitedEmail}</p>
      <p style="margin: 5px 0;"><strong>Display Name:</strong> ${data.displayName}</p>
    </div>
    
    <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4caf50;">
      <h2 style="color: #092635; margin-top: 0; font-size: 18px;">🔗 Accept Your Invitation</h2>
      <p style="margin: 10px 0;">
        <a href="${invitationLink}" style="display: inline-block; background: #5C8374; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 0;">
          Sign In with Google →
        </a>
      </p>
      <p style="margin: 5px 0; font-size: 14px; color: #666;">
        You must sign in with <strong>${data.invitedEmail}</strong> to accept this invitation.
      </p>
    </div>
    
    ${permissionsList.length > 0 ? `
    <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
      <h2 style="color: #092635; margin-top: 0; font-size: 18px;">🔐 Your Permissions</h2>
      <ul style="margin: 10px 0; padding-left: 20px;">
        ${permissionsList.map(p => `<li style="margin: 8px 0;">${p.replace('•', '')}</li>`).join('')}
      </ul>
    </div>
    ` : `
    <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0; color: #666; font-size: 14px;">You have view-only access to the portfolio.</p>
    </div>
    `}
    
    <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3;">
      <h2 style="color: #092635; margin-top: 0; font-size: 18px;">📝 What is Ascent?</h2>
      <p style="margin: 10px 0; font-size: 14px;">
        Ascent is a comprehensive personal finance management application that helps you track:
      </p>
      <ul style="margin: 10px 0; padding-left: 20px; font-size: 14px;">
        <li>Investment portfolios and positions</li>
        <li>Income and expenses</li>
        <li>Financial goals and budgets</li>
        <li>Personal notes and memos</li>
      </ul>
    </div>
    
    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h2 style="color: #092635; margin-top: 0; font-size: 18px;">🚀 Getting Started</h2>
      <ol style="margin: 10px 0; padding-left: 20px; font-size: 14px;">
        <li>Click the invitation link above</li>
        <li>Sign in with Google using your email address (<strong>${data.invitedEmail}</strong>)</li>
        <li>Your invitation will be automatically accepted and you'll have access to the account</li>
      </ol>
    </div>
    
    <div style="border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 30px;">
      <p style="margin: 5px 0; font-size: 14px; color: #666;">
        <strong>Need Help?</strong><br>
        If you have any questions or need assistance, please contact <strong>${user.full_name}</strong> at 
        <a href="mailto:${user.email}" style="color: #5C8374;">${user.email}</a>.
      </p>
    </div>
    
    <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #999; text-align: center;">
      Best regards,<br>
      <strong style="color: #5C8374;">Ascent Team</strong><br><br>
      <em>This is an automated invitation email. Please do not reply to this email.</em>
    </p>
  </div>
</body>
</html>`;

          const emailResult = await ascent.integrations.Core.SendEmail({
            to: data.invitedEmail,
            subject: `You've been invited to collaborate on ${user.full_name}'s Ascent account`,
            body: emailBody,
            html: emailHtml
          });
        
          // Check if email was actually sent
          if (emailResult && emailResult.sent === false) {
            console.warn('Email not sent - SMTP not configured');
            // Still return invitation but with a warning
            return { ...invitation, emailSent: false };
          }
          
          return { ...invitation, emailSent: true };
        } catch (emailError) {
          console.error('Email sending error:', emailError);
          // Still return invitation even if email fails
          return { ...invitation, emailSent: false, emailError: emailError.message };
        }
      };
      
      // Send email in background (don't await - fire and forget)
      sendEmailAsync().catch(err => {
        console.error('Background email sending failed:', err);
        // Don't show error to user since dialog is already closed
      });
      
      return invitation;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['sharedUsers'] });
      // Dialog is already closed by InviteUserDialog component
      // Show success message (email is sent asynchronously)
      toast.success('Invitation created successfully! The invitation email will be sent shortly.');
    },
    onError: (error) => {
      console.error('Invitation error:', error);
      const errorMsg = error?.message || 'Unknown error';
      
      // Check if user session is invalid
      if (errorMsg.includes('User not found') || errorMsg.includes('Invalid or expired token') || errorMsg.includes('No token provided')) {
        toast.error('Your session has expired. Please log out and log back in.');
        // Optionally redirect to login after a delay
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
        return;
      }
      
      if (errorMsg.includes('BadCredentials') || errorMsg.includes('Invalid login')) {
        toast.error('Failed to send invitation: Gmail authentication failed. Please check your App Password in .env file.');
      } else {
        toast.error(`Failed to send invitation: ${errorMsg}`);
      }
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
          <CardManagement user={user} />

          {/* Shared Access */}
          <SharedUsersSection
            sharedUsers={sharedUsers}
            onInvite={() => setInviteDialogOpen(true)}
            onUpdate={(id, data) => updateSharedUserMutation.mutate({ id, data })}
            onDelete={deleteSharedUserMutation.mutate}
            canManageUsers={!myPermissions || myPermissions.manageUsers === true}
          />

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