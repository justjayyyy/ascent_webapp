import React, { useState } from 'react';
import { ascent } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreditCard, Plus, Trash2, Edit2, X, Check } from 'lucide-react';
import { useTheme } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function CardManagement({ user }) {
  const { colors, t } = useTheme();
  const [isAdding, setIsAdding] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [formData, setFormData] = useState({ name: '', lastFourDigits: '', type: 'credit' });
  const queryClient = useQueryClient();

  const { data: cards = [] } = useQuery({
    queryKey: ['cards', user?.id],
    queryFn: async () => {
      if (!user) return [];
      return await ascent.entities.Card.filter({ created_by: user.email }, '-created_date');
    },
    enabled: !!user,
  });

  const createCardMutation = useMutation({
    mutationFn: (data) => ascent.entities.Card.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      setIsAdding(false);
      setFormData({ name: '', lastFourDigits: '', type: 'credit' });
      toast.success(t('cardAddedSuccessfully'));
    },
  });

  const updateCardMutation = useMutation({
    mutationFn: ({ id, data }) => ascent.entities.Card.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      setEditingCard(null);
      setFormData({ name: '', lastFourDigits: '', type: 'credit' });
      toast.success(t('cardUpdatedSuccessfully'));
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: (id) => ascent.entities.Card.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      toast.success(t('cardDeletedSuccessfully'));
    },
  });

  const handleSubmit = () => {
    if (!formData.name || !formData.lastFourDigits) {
      toast.error(t('pleaseFillAllFields'));
      return;
    }

    if (formData.lastFourDigits.length !== 4 || !/^\d+$/.test(formData.lastFourDigits)) {
      toast.error(t('last4DigitsMustBe4'));
      return;
    }

    if (editingCard) {
      updateCardMutation.mutate({ id: editingCard.id, data: formData });
    } else {
      createCardMutation.mutate(formData);
    }
  };

  const handleEdit = (card) => {
    setEditingCard(card);
    setFormData({
      name: card.name,
      lastFourDigits: card.lastFourDigits,
      type: card.type,
    });
    setIsAdding(true);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingCard(null);
    setFormData({ name: '', lastFourDigits: '', type: 'credit' });
  };

  return (
    <Card className={cn(colors.cardBg, colors.cardBorder)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-[#5C8374]" />
            <CardTitle className={colors.accentText}>{t('paymentCards')}</CardTitle>
          </div>
          {!isAdding && (
            <Button
              onClick={() => setIsAdding(true)}
              size="sm"
              className="bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('addCard')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isAdding && (
          <div className={cn("mb-4 p-4 rounded-lg border", colors.bgTertiary, colors.border)}>
            <div className="space-y-3">
              <div>
                <Label className={colors.textSecondary}>{t('cardName')}</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Chase Sapphire, Amex Gold..."
                  className={cn(colors.bgPrimary, colors.border, colors.textPrimary)}
                />
              </div>
              <div>
                <Label className={colors.textSecondary}>{t('lastFourDigits')}</Label>
                <Input
                  value={formData.lastFourDigits}
                  onChange={(e) => setFormData({ ...formData, lastFourDigits: e.target.value })}
                  placeholder="1234"
                  maxLength={4}
                  className={cn(colors.bgPrimary, colors.border, colors.textPrimary)}
                />
              </div>
              <div>
                <Label className={colors.textSecondary}>{t('cardType')}</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger className={cn(colors.bgPrimary, colors.border, colors.textPrimary)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                    <SelectItem value="credit" className={colors.textPrimary}>{t('credit')}</SelectItem>
                    <SelectItem value="debit" className={colors.textPrimary}>{t('debit')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSubmit}
                  className="bg-[#5C8374] hover:bg-[#5C8374]/80 text-white flex-1"
                >
                  <Check className="w-4 h-4 mr-2" />
                  {editingCard ? 'Update' : 'Add'}
                </Button>
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  className={cn("flex-1", colors.border, colors.textSecondary)}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {cards.length > 0 ? (
          <div className="space-y-2">
            {cards.map((card) => (
              <div
                key={card.id}
                className={cn("flex items-center justify-between p-3 rounded-lg border", colors.bgTertiary, colors.border)}
              >
                <div className="flex items-center gap-3">
                  <CreditCard className={cn("w-5 h-5", colors.accentText)} />
                  <div>
                    <p className={cn("font-medium", colors.textPrimary)}>
                      {card.name} •••• {card.lastFourDigits}
                    </p>
                    <p className={cn("text-sm capitalize", colors.textTertiary)}>{card.type}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleEdit(card)}
                    size="icon"
                    variant="ghost"
                    className={colors.textSecondary}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={() => deleteCardMutation.mutate(card.id)}
                    size="icon"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !isAdding && (
            <div className={cn("text-center py-6", colors.textTertiary)}>
              <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>{t('noCardsYet')}</p>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}