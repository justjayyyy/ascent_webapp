import React, { useState, useCallback, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { UserPlus, Mail, Edit, Trash2, Shield, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useTheme } from '../ThemeProvider';

const SharedUsersSection = memo(function SharedUsersSection({ 
  sharedUsers = [], 
  onInvite, 
  onUpdate, 
  onDelete,
  canManageUsers = true 
}) {
  const { colors, t } = useTheme();
  const [editingUser, setEditingUser] = useState(null);
  const [showPermissions, setShowPermissions] = useState({});

  const statusColors = {
    pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    accepted: 'bg-green-500/10 text-green-400 border-green-500/30',
    revoked: 'bg-red-500/10 text-red-400 border-red-500/30',
  };

  const togglePermission = useCallback((user, key) => {
    const updatedPermissions = {
      ...user.permissions,
      [key]: !user.permissions[key],
    };
    onUpdate(user.id, { permissions: updatedPermissions });
  }, [onUpdate]);

  const toggleShowPermissions = useCallback((userId) => {
    setShowPermissions(prev => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  }, []);

  return (
    <Card className={cn(colors.cardBg, colors.cardBorder)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserPlus className="w-5 h-5 text-[#5C8374]" />
            <CardTitle className={colors.accentText}>{t('sharedAccess')}</CardTitle>
          </div>
          {canManageUsers && (
            <Button
              onClick={onInvite}
              size="sm"
              className="bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              {t('inviteUser')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {sharedUsers.length > 0 ? (
          <div className="space-y-4">
            {sharedUsers.map((user) => (
              <div
                key={user.id}
                className={cn("p-4 rounded-lg border", colors.bgTertiary, colors.border)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-full bg-[#5C8374]/20 flex items-center justify-center font-semibold", colors.accentText)}>
                      {user.displayName?.[0]?.toUpperCase() || user.invitedEmail[0].toUpperCase()}
                    </div>
                    <div>
                      <p className={cn("font-semibold", colors.textPrimary)}>{user.displayName || 'Unnamed User'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Mail className={cn("w-3 h-3", colors.textTertiary)} />
                        <p className={cn("text-sm", colors.textTertiary)}>{user.invitedEmail}</p>
                      </div>
                      <Badge className={cn('text-xs border mt-2', statusColors[user.status])}>
                        {t(user.status)}
                      </Badge>
                    </div>
                  </div>
                  {canManageUsers && (
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toggleShowPermissions(user.id)}
                        className={cn("h-8 w-8 hover:bg-[#5C8374]/20", colors.textSecondary)}
                      >
                        {showPermissions[user.id] ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDelete(user.id)}
                        className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {showPermissions[user.id] && canManageUsers && (
                  <div className={cn("mt-4 pt-4 border-t space-y-2", colors.borderLight)}>
                    <div className="flex items-center justify-between py-2">
                      <Label className={cn("text-sm", colors.textPrimary)}>{t('viewPortfolio')}</Label>
                      <Switch
                        checked={user.permissions?.viewPortfolio || false}
                        onCheckedChange={() => togglePermission(user, 'viewPortfolio')}
                      />
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <Label className={cn("text-sm", colors.textPrimary)}>{t('editPortfolio')}</Label>
                      <Switch
                        checked={user.permissions?.editPortfolio || false}
                        onCheckedChange={() => togglePermission(user, 'editPortfolio')}
                      />
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <Label className={cn("text-sm", colors.textPrimary)}>{t('viewExpenses')}</Label>
                      <Switch
                        checked={user.permissions?.viewExpenses || false}
                        onCheckedChange={() => togglePermission(user, 'viewExpenses')}
                      />
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <Label className={cn("text-sm", colors.textPrimary)}>{t('editExpenses')}</Label>
                      <Switch
                        checked={user.permissions?.editExpenses || false}
                        onCheckedChange={() => togglePermission(user, 'editExpenses')}
                      />
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <Label className={cn("text-sm", colors.textPrimary)}>{t('viewNotes')}</Label>
                      <Switch
                        checked={user.permissions?.viewNotes || false}
                        onCheckedChange={() => togglePermission(user, 'viewNotes')}
                      />
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <Label className={cn("text-sm", colors.textPrimary)}>{t('editNotes')}</Label>
                      <Switch
                        checked={user.permissions?.editNotes || false}
                        onCheckedChange={() => togglePermission(user, 'editNotes')}
                      />
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <Label className={cn("text-sm", colors.textPrimary)}>{t('viewGoals')}</Label>
                      <Switch
                        checked={user.permissions?.viewGoals || false}
                        onCheckedChange={() => togglePermission(user, 'viewGoals')}
                      />
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <Label className={cn("text-sm", colors.textPrimary)}>{t('editGoals')}</Label>
                      <Switch
                        checked={user.permissions?.editGoals || false}
                        onCheckedChange={() => togglePermission(user, 'editGoals')}
                      />
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <Label className={cn("text-sm", colors.textPrimary)}>{t('viewBudgets')}</Label>
                      <Switch
                        checked={user.permissions?.viewBudgets || false}
                        onCheckedChange={() => togglePermission(user, 'viewBudgets')}
                      />
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <Label className={cn("text-sm", colors.textPrimary)}>{t('editBudgets')}</Label>
                      <Switch
                        checked={user.permissions?.editBudgets || false}
                        onCheckedChange={() => togglePermission(user, 'editBudgets')}
                      />
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <Label className={cn("text-sm", colors.textPrimary)}>{t('viewSettings')}</Label>
                      <Switch
                        checked={user.permissions?.viewSettings || false}
                        onCheckedChange={() => togglePermission(user, 'viewSettings')}
                      />
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <Label className={cn("text-sm", colors.textPrimary)}>{t('manageUsers')}</Label>
                      <Switch
                        checked={user.permissions?.manageUsers || false}
                        onCheckedChange={() => togglePermission(user, 'manageUsers')}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Shield className="w-12 h-12 text-[#5C8374] mx-auto mb-3" />
            <p className={cn("mb-4", colors.textTertiary)}>{t('noSharedUsersYet')}</p>
            {canManageUsers && (
              <Button
                onClick={onInvite}
                variant="outline"
                className={cn("bg-transparent hover:bg-[#5C8374]/20", colors.border, colors.textSecondary)}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {t('inviteFirstUser')}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default SharedUsersSection;