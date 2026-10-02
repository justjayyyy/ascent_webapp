import React, { useMemo, useState } from 'react';
import { ascent } from '@/api/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCards } from '@/hooks/useWorkspaceData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreditCard, Plus, Trash2, Pencil, Star } from 'lucide-react';
import { useTheme } from '../ThemeProvider';
import { toast } from 'sonner';
import BlurValue from '../BlurValue';
import { Section, Group } from './SettingsShell';

const EMPTY = { name: '', lastFourDigits: '', type: 'credit', walletName: '' };

export default function CardManagement({ index }) {
  const { t, user } = useTheme();
  const [isAdding, setIsAdding] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [formData, setFormData] = useState(EMPTY);
  const queryClient = useQueryClient();

  const { data: allCards = [] } = useCards();
  // Each member manages only the cards they added, even in a shared household
  const myId = String(user?.id || user?._id || '');
  const cards = useMemo(() => allCards.filter((c) => !c.createdBy || String(c.createdBy) === myId), [allCards, myId]);

  const close = () => {
    setIsAdding(false);
    setEditingCard(null);
    setFormData(EMPTY);
  };

  const createCardMutation = useMutation({
    mutationFn: (data) => ascent.entities.Card.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      close();
      toast.success(t('cardAddedSuccessfully'));
    },
  });

  const updateCardMutation = useMutation({
    mutationFn: ({ id, data }) => ascent.entities.Card.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      close();
      toast.success(t('cardUpdatedSuccessfully'));
    },
  });

  // Only one default per person: mark the picked card and clear the flag on their others
  const defaultCardMutation = useMutation({
    mutationFn: (id) => Promise.all(cards
      .filter((c) => !!c.isDefault !== (c.id === id))
      .map((c) => ascent.entities.Card.update(c.id, { isDefault: c.id === id }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      toast.success(t('defaultCardUpdated'));
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: (id) => ascent.entities.Card.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      toast.success(t('cardDeletedSuccessfully'));
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.lastFourDigits) {
      toast.error(t('pleaseFillAllFields'));
      return;
    }
    if (formData.lastFourDigits.length !== 4 || !/^\d+$/.test(formData.lastFourDigits)) {
      toast.error(t('last4DigitsMustBe4'));
      return;
    }
    if (editingCard) updateCardMutation.mutate({ id: editingCard.id, data: formData });
    else createCardMutation.mutate(formData);
  };

  const handleEdit = (card) => {
    setEditingCard(card);
    setFormData({ name: card.name, lastFourDigits: card.lastFourDigits, type: card.type, walletName: card.walletName || '' });
    setIsAdding(true);
  };

  const saving = createCardMutation.isPending || updateCardMutation.isPending;

  return (
    <Section
      id="cards"
      index={index}
      icon={CreditCard}
      title={t('paymentCards')}
      description={t('setCardsDesc')}
      action={!isAdding && (
        <Button onClick={() => setIsAdding(true)} className="h-11 shrink-0 rounded-xl sm:h-9">
          <Plus className="me-1.5 h-4 w-4" aria-hidden="true" />
          {t('addCard')}
        </Button>
      )}
    >
      <Group>
        {isAdding && (
          <form onSubmit={handleSubmit} className="grid gap-4 bg-muted/30 px-4 py-4 sm:grid-cols-[1fr_7rem_8rem] sm:px-5 animate-in fade-in slide-in-from-top-2 duration-200 motion-reduce:animate-none">
            <div className="space-y-1.5">
              <Label htmlFor="card-name">{t('cardName')}</Label>
              <Input
                id="card-name"
                autoFocus
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Chase Sapphire, Amex Gold..."
                className="h-11 rounded-xl sm:h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-last4">{t('lastFourDigits')}</Label>
              <Input
                id="card-last4"
                inputMode="numeric"
                value={formData.lastFourDigits}
                onChange={(e) => setFormData({ ...formData, lastFourDigits: e.target.value.replace(/\D/g, '') })}
                placeholder="1234"
                maxLength={4}
                className="h-11 rounded-xl tabular-nums sm:h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-type">{t('cardType')}</Label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger id="card-type" className="h-11 rounded-xl sm:h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">{t('credit')}</SelectItem>
                  <SelectItem value="debit">{t('debit')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="card-wallet-name">{t('walletNameLabel')}</Label>
              <Input
                id="card-wallet-name"
                value={formData.walletName}
                onChange={(e) => setFormData({ ...formData, walletName: e.target.value })}
                placeholder="Visa ••1234"
                maxLength={80}
                dir="ltr"
                className="h-11 rounded-xl sm:h-10"
              />
              <p className="text-xs text-muted-foreground">{t('walletNameHint')}</p>
            </div>
            <div className="flex gap-2 sm:col-span-3 sm:justify-end">
              <Button type="button" variant="ghost" onClick={close} className="h-11 flex-1 rounded-xl sm:h-10 sm:flex-none">
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={saving} className="h-11 flex-1 rounded-xl sm:h-10 sm:flex-none">
                {t('save')}
              </Button>
            </div>
          </form>
        )}

        {cards.map((card) => (
          <div key={card.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <CreditCard className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {user?.blurValues ? (
                  <BlurValue blur={true}>••••••</BlurValue>
                ) : (
                  <>
                    {card.name}
                    <span className="ms-2 tabular-nums text-muted-foreground" dir="ltr">•••• {card.lastFourDigits}</span>
                  </>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {t(card.type) || card.type}
                {(cards.length === 1 || card.isDefault) && <span className="ms-2 font-medium text-primary">· {t('defaultCard')}</span>}
              </p>
            </div>
            {cards.length > 1 && (
              <Button
                onClick={() => !card.isDefault && defaultCardMutation.mutate(card.id)}
                size="icon"
                variant="ghost"
                disabled={defaultCardMutation.isPending}
                aria-label={t('setAsDefaultCard')}
                aria-pressed={!!card.isDefault}
                title={t('setAsDefaultCard')}
                className={`h-11 w-11 rounded-xl sm:h-9 sm:w-9 ${card.isDefault ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Star className="h-4 w-4" fill={card.isDefault ? 'currentColor' : 'none'} />
              </Button>
            )}
            <Button
              onClick={() => handleEdit(card)}
              size="icon"
              variant="ghost"
              aria-label={t('edit')}
              className="h-11 w-11 rounded-xl text-muted-foreground hover:text-foreground sm:h-9 sm:w-9"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => deleteCardMutation.mutate(card.id)}
              size="icon"
              variant="ghost"
              aria-label={t('delete')}
              className="h-11 w-11 rounded-xl text-danger hover:bg-danger/15 hover:text-danger sm:h-9 sm:w-9"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {cards.length === 0 && !isAdding && (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <CreditCard className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="max-w-xs text-sm text-muted-foreground text-pretty">{t('noCardsYet')}</p>
          </div>
        )}
      </Group>
    </Section>
  );
}
