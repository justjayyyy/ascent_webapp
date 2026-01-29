import React, { useState, useCallback, useMemo, memo } from 'react';
import { ascent } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Plus, Loader2, Pin, PinOff, Trash2, X, Search, 
  StickyNote, Edit2, Check, Tag, Eye, EyeOff
} from 'lucide-react';
import { useTheme } from '../components/ThemeProvider';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const NOTE_COLORS = [
  '#5C8374', // Default green
  '#3B82F6', // Blue
  '#F59E0B', // Yellow/Orange
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#6B7280', // Gray
];

function Notes() {
  const { user, colors, t, theme, isRTL } = useTheme();
  const { currentWorkspace, hasPermission } = useAuth();
  const isOwner = currentWorkspace?.ownerId === user?.id || currentWorkspace?.ownerId === user?._id;
  const canEdit = hasPermission('editNotes');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [noteForm, setNoteForm] = useState({ 
    title: '', 
    content: '', 
    color: '#5C8374',
    tags: [],
    isShared: true
  });
  const [newTag, setNewTag] = useState('');
  const queryClient = useQueryClient();

  // Memoize user identifiers
  const userId = useMemo(() => user?.id || user?._id, [user?.id, user?._id]);
  const userEmail = useMemo(() => user?.email, [user?.email]);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes', userId],
    queryFn: async () => {
      if (!userEmail) return [];
      return await ascent.entities.Note.filter({ created_by: userEmail });
    },
    enabled: !!userEmail,
    staleTime: 3 * 60 * 1000,
  });

  const createNoteMutation = useMutation({
    mutationFn: (newNote) => ascent.entities.Note.create(newNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      closeDialog();
      toast.success(t('noteCreated') || 'Note created');
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, data }) => ascent.entities.Note.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      closeDialog();
      toast.success(t('noteUpdated') || 'Note updated');
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId) => ascent.entities.Note.delete(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success(t('noteDeleted') || 'Note deleted');
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: ({ id, isPinned }) => ascent.entities.Note.update(id, { isPinned: !isPinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  const openNewNote = useCallback(() => {
    setEditingNote(null);
    setNoteForm({ title: '', content: '', color: '#5C8374', tags: [], isShared: true });
    setIsDialogOpen(true);
  }, []);

  const openEditNote = useCallback((note) => {
    setEditingNote(note);
    setNoteForm({ 
      title: note.title, 
      content: note.content, 
      color: note.color || '#5C8374',
      tags: note.tags || [],
      isShared: note.isShared !== false
    });
    setIsDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false);
    setEditingNote(null);
    setNoteForm({ title: '', content: '', color: '#5C8374', tags: [], isShared: true });
    setNewTag('');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!noteForm.title.trim() && !noteForm.content.trim()) {
      toast.error(t('noteTitleOrContentRequired') || 'Please add a title or content');
      return;
    }

    const noteData = {
      title: noteForm.title.trim() || 'Untitled',
      content: noteForm.content,
      color: noteForm.color,
      tags: noteForm.tags,
      isShared: noteForm.isShared
    };

    if (editingNote) {
      await updateNoteMutation.mutateAsync({ id: editingNote.id, data: noteData });
    } else {
      await createNoteMutation.mutateAsync(noteData);
    }
  }, [noteForm, editingNote, updateNoteMutation, createNoteMutation, t]);

  const addTag = useCallback(() => {
    if (newTag.trim() && !noteForm.tags.includes(newTag.trim())) {
      setNoteForm(prev => ({ ...prev, tags: [...prev.tags, newTag.trim()] }));
      setNewTag('');
    }
  }, [newTag, noteForm.tags]);

  const removeTag = useCallback((tagToRemove) => {
    setNoteForm(prev => ({ 
      ...prev, 
      tags: prev.tags.filter(tag => tag !== tagToRemove) 
    }));
  }, []);

  // Filter notes by search query - memoized for performance
  const filteredNotes = useMemo(() => {
    if (!searchQuery) return notes;
    const query = searchQuery.toLowerCase();
    return notes.filter(note => {
      return (
        note.title?.toLowerCase().includes(query) ||
        note.content?.toLowerCase().includes(query) ||
        note.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    });
  }, [notes, searchQuery]);

  // Sort notes: pinned first, then by updated date - memoized
  const sortedNotes = useMemo(() => {
    return [...filteredNotes].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.updated_date) - new Date(a.updated_date);
    });
  }, [filteredNotes]);

  const pinnedNotes = useMemo(() => sortedNotes.filter(n => n.isPinned), [sortedNotes]);
  const unpinnedNotes = useMemo(() => sortedNotes.filter(n => !n.isPinned), [sortedNotes]);

  if (!user || isLoading) {
    return (
      <div className={cn("flex items-center justify-center min-h-screen", colors.bgPrimary)}>
        <Loader2 className={cn("w-8 h-8 animate-spin", colors.accentText)} />
      </div>
    );
  }

  return (
    <div className={cn("p-2 sm:p-4 md:p-8", colors.bgPrimary)}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-3 sm:mb-8">
          <div className={cn(
            "flex items-start sm:items-center justify-between mb-2 sm:mb-6 gap-2 sm:gap-4",
            "flex-col sm:flex-row",
            isRTL && "flex-col-reverse sm:flex-row-reverse"
          )}>
            <div className={cn(isRTL && "text-right w-full sm:w-auto")}>
              <h1 className={cn("text-lg sm:text-2xl md:text-3xl lg:text-4xl font-bold mb-0.5 sm:mb-2", colors.textPrimary)}>
                {t('notes') || 'Notes'}
              </h1>
              <p className={cn("text-[10px] sm:text-base hidden sm:block", colors.textTertiary)}>
                {t('notesDescription') || 'Your personal notes and ideas'}
              </p>
            </div>
            {canEdit && (
            <Button
              onClick={openNewNote}
              size="sm"
              className={cn(
                "bg-[#5C8374] hover:bg-[#5C8374]/80 text-white h-6 sm:h-10 text-xs sm:text-base px-2.5 sm:px-4 py-1 sm:py-2",
                "w-auto rounded-md shadow-sm hover:shadow transition-all flex items-center justify-center gap-1.5 sm:gap-2"
              )}
            >
              <Plus className={cn("w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0")} />
              <span className="whitespace-nowrap">{t('newNote') || 'New Note'}</span>
            </Button>
            )}
          </div>

          {/* Search */}
          <div className={cn("relative max-w-md w-full", isRTL && "mr-auto ml-0")}>
            <Search className={cn(
              "absolute top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4", 
              colors.textTertiary,
              isRTL ? "right-2 sm:right-3" : "left-2 sm:left-3"
            )} />
            <Input
              type="text"
              placeholder={t('searchNotes') || 'Search notes...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "h-7 sm:h-10 text-xs sm:text-sm", colors.bgSecondary, colors.border, colors.textPrimary,
                isRTL ? "pr-7 sm:pr-10 text-right" : "pl-7 sm:pl-10"
              )}
              dir={isRTL ? 'rtl' : 'ltr'}
            />
          </div>
        </div>

        {/* Notes Grid */}
        {sortedNotes.length === 0 ? (
          <div className={cn("text-center py-8 sm:py-16", colors.textTertiary)}>
            <StickyNote className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-2 sm:mb-4 opacity-50" />
            <p className={cn("text-sm sm:text-lg mb-1 sm:mb-2", colors.textTertiary)}>{t('noNotesYet') || 'No notes yet'}</p>
            <p className={cn("text-xs sm:text-sm", colors.textTertiary)}>{t('createFirstNote') || 'Create your first note to get started'}</p>
          </div>
        ) : (
          <>
            {/* Pinned Notes */}
            {pinnedNotes.length > 0 && (
              <div className="mb-3 sm:mb-8">
                <h2 className={cn(
                  "text-[10px] sm:text-sm font-medium mb-1.5 sm:mb-4 flex items-center gap-1 sm:gap-2", 
                  colors.textTertiary,
                  isRTL && "flex-row-reverse justify-end"
                )}>
                  <Pin className="w-3 h-3 sm:w-4 sm:h-4" />
                  {t('pinned') || 'Pinned'}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5 sm:gap-4">
                  {pinnedNotes.map(note => (
                    <NoteCard 
                      key={note.id} 
                      note={note} 
                      onEdit={openEditNote}
                      onDelete={deleteNoteMutation.mutate}
                      onTogglePin={(id, isPinned) => togglePinMutation.mutate({ id, isPinned })}
                      colors={colors}
                      theme={theme}
                      t={t}
                      isRTL={isRTL}
                      canEdit={canEdit}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Other Notes */}
            {unpinnedNotes.length > 0 && (
              <div>
                {pinnedNotes.length > 0 && (
                  <h2 className={cn("text-[10px] sm:text-sm font-medium mb-1.5 sm:mb-4", colors.textTertiary, isRTL && "text-right")}>
                    {t('others') || 'Others'}
                  </h2>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5 sm:gap-4">
                  {unpinnedNotes.map(note => (
                    <NoteCard 
                      key={note.id} 
                      note={note} 
                      onEdit={openEditNote}
                      onDelete={deleteNoteMutation.mutate}
                      onTogglePin={(id, isPinned) => togglePinMutation.mutate({ id, isPinned })}
                      colors={colors}
                      theme={theme}
                      t={t}
                      isRTL={isRTL}
                      canEdit={canEdit}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Note Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent 
            className={cn("max-w-4xl w-[95vw] sm:w-full max-h-[80vh] sm:max-h-[75vh] min-h-[50vh] sm:min-h-0 overflow-y-auto p-3 sm:p-6", colors.bgSecondary, colors.border)}
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            <DialogHeader className="pb-2 sm:pb-4">
              <DialogTitle className={cn("text-base sm:text-xl", colors.textPrimary, isRTL && "text-right")}>
                {editingNote ? (t('editNote') || 'Edit Note') : (t('newNote') || 'New Note')}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-2 sm:space-y-4">
              {/* Title */}
              <Input
                placeholder={t('noteTitle') || 'Title'}
                value={noteForm.title}
                onChange={(e) => setNoteForm(prev => ({ ...prev, title: e.target.value }))}
                className={cn("h-8 sm:h-auto text-sm sm:text-lg font-medium", colors.bgPrimary, colors.border, colors.textPrimary)}
              />

              {/* Content */}
              <Textarea
                placeholder={t('noteContent') || 'Write your note...'}
                value={noteForm.content}
                onChange={(e) => setNoteForm(prev => ({ ...prev, content: e.target.value }))}
                rows={4}
                className={cn(colors.bgPrimary, colors.border, colors.textPrimary, "resize-y min-h-[250px] sm:min-h-[200px] max-h-[600px] sm:max-h-[400px] text-xs sm:text-sm")}
              />

              {/* Color Picker */}
              <div>
                <label className={cn("text-[10px] sm:text-sm font-medium mb-1 sm:mb-2 block", colors.textSecondary)}>
                  {t('noteColor') || 'Color'}
                </label>
                <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                  {NOTE_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setNoteForm(prev => ({ ...prev, color }))}
                      className={cn(
                        "w-6 h-6 sm:w-8 sm:h-8 rounded-full transition-all",
                        noteForm.color === color ? "ring-2 ring-offset-1 sm:ring-offset-2 ring-white scale-110" : "hover:scale-105"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className={cn("text-[10px] sm:text-sm font-medium mb-1 sm:mb-2 block", colors.textSecondary)}>
                  {t('tags') || 'Tags'}
                </label>
                <div className="flex gap-1 sm:gap-2 mb-1.5 sm:mb-2 flex-wrap">
                  {noteForm.tags.map(tag => (
                    <span 
                      key={tag}
                      className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-xs bg-[#5C8374]/20 text-[#5C8374]"
                    >
                      <Tag className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      {tag}
                      <button onClick={() => removeTag(tag)} className="hover:text-red-400">
                        <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5 sm:gap-2">
                  <Input
                    placeholder={t('addTag') || 'Add tag...'}
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    className={cn("flex-1 h-7 sm:h-10 text-xs sm:text-sm", colors.bgPrimary, colors.border, colors.textPrimary)}
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={addTag}
                    className={cn("h-7 sm:h-10 px-2 sm:px-4", colors.border, colors.textSecondary)}
                  >
                    <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                  </Button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-1.5 sm:gap-2 pt-2 sm:pt-4 justify-between items-center">
                {isOwner && (
                  <div className="flex items-center gap-2">
                    {noteForm.isShared ? (
                      <Eye className={cn("w-4 h-4", colors.textSecondary)} />
                    ) : (
                      <EyeOff className={cn("w-4 h-4", colors.textTertiary)} />
                    )}
                    <Label htmlFor="isShared" className={cn("text-xs sm:text-sm cursor-pointer", colors.textSecondary)}>
                      {t('shareWithTeam') || 'Share'}
                    </Label>
                    <Switch
                      id="isShared"
                      checked={noteForm.isShared}
                      onCheckedChange={(checked) => setNoteForm(prev => ({ ...prev, isShared: checked }))}
                    />
                  </div>
                )}
                <div className="flex gap-1.5 sm:gap-2 flex-1 justify-end">
                  <Button 
                    variant="outline" 
                    onClick={closeDialog}
                    className={cn("h-7 sm:h-10 text-xs sm:text-base px-3 sm:px-4", colors.border, colors.textSecondary)}
                  >
                    {t('cancel') || 'Cancel'}
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={createNoteMutation.isPending || updateNoteMutation.isPending}
                    className="bg-[#5C8374] hover:bg-[#5C8374]/80 text-white h-7 sm:h-10 text-xs sm:text-base px-3 sm:px-4"
                  >
                    {(createNoteMutation.isPending || updateNoteMutation.isPending) && (
                      <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin me-1 sm:me-2" />
                    )}
                    {editingNote ? (t('save') || 'Save') : (t('create') || 'Create')}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default memo(Notes);

// Note Card Component - memoized for performance
const NoteCard = memo(function NoteCard({ note, onEdit, onDelete, onTogglePin, colors, theme, t, isRTL, canEdit }) {
  const [showActions, setShowActions] = useState(false);

  const handleMouseEnter = useCallback(() => setShowActions(true), []);
  const handleMouseLeave = useCallback(() => setShowActions(false), []);
  const handleClick = useCallback(() => {
    if (canEdit) onEdit(note);
  }, [onEdit, note, canEdit]);
  const handleTogglePin = useCallback(() => onTogglePin(note.id, note.isPinned), [onTogglePin, note.id, note.isPinned]);
  const handleDelete = useCallback(() => onDelete(note.id), [onDelete, note.id]);

  // Memoize formatted dates
  const createdDate = useMemo(() => new Date(note.created_date).toLocaleDateString(), [note.created_date]);
  const updatedDate = useMemo(() => note.updated_date !== note.created_date ? new Date(note.updated_date).toLocaleDateString() : null, [note.updated_date, note.created_date]);

  // Memoize card style
  const cardStyle = useMemo(() => ({
    backgroundColor: theme === 'light' ? `${note.color}15` : `${note.color}25`,
    [isRTL ? 'borderRightWidth' : 'borderLeftWidth']: '4px',
    [isRTL ? 'borderRightColor' : 'borderLeftColor']: note.color
  }), [note.color, theme, isRTL]);

  return (
    <Card 
      className={cn(
        "group cursor-pointer transition-all hover:shadow-lg relative overflow-hidden",
        colors.cardBorder
      )}
      style={cardStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <CardContent className="p-2 sm:p-5">
        {/* Title */}
        <h3 className={cn("text-xs sm:text-base font-semibold mb-0.5 sm:mb-2 line-clamp-1", colors.textPrimary)}>
          {note.title || 'Untitled'}
        </h3>

        {/* Content Preview */}
        <p className={cn("text-[10px] sm:text-sm line-clamp-2 sm:line-clamp-4 whitespace-pre-wrap", colors.textSecondary)}>
          {note.content || (t('noContent') || 'No content')}
        </p>

        {/* Tags */}
        {note.tags?.length > 0 && (
          <div className="flex gap-0.5 sm:gap-1 mt-1 sm:mt-3 flex-wrap items-center">
            {note.tags.slice(0, 2).map(tag => (
              <span 
                key={tag}
                className="inline-flex items-center gap-0.5 px-1 sm:px-2 py-0 sm:py-0.5 rounded-full text-[9px] sm:text-xs"
                style={{ backgroundColor: `${note.color}30`, color: note.color }}
              >
                {tag}
              </span>
            ))}
            {note.tags.length > 2 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={cn("text-[9px] sm:text-xs cursor-help px-1 sm:px-2 py-0 sm:py-0.5 rounded-full", colors.textTertiary, "hover:bg-gray-500/20")}>
                      +{note.tags.length - 2}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <p className="text-xs">{note.tags.slice(2).join(', ')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}

        {/* Dates */}
        <div className={cn("text-[9px] sm:text-xs mt-1 sm:mt-3 space-y-0 hidden sm:block", colors.textTertiary)}>
          <p>{t('created') || 'Created'}: {createdDate}</p>
          {updatedDate && (
            <p>{t('updated') || 'Updated'}: {updatedDate}</p>
          )}
        </div>

        {/* Action Buttons */}
        {canEdit && (
        <div 
          className={cn(
            "absolute top-0.5 sm:top-2 flex gap-0.5 sm:gap-1 transition-opacity",
            isRTL ? "left-0.5 sm:left-2" : "right-0.5 sm:right-2",
            showActions ? "opacity-100" : "opacity-0"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleTogglePin}
            className={cn(
              "p-0.5 sm:p-1.5 rounded-full transition-colors",
              note.isPinned 
                ? "bg-[#5C8374] text-white" 
                : cn(colors.bgSecondary, colors.textSecondary, "hover:bg-[#5C8374]/20")
            )}
            title={note.isPinned ? (t('unpin') || 'Unpin') : (t('pin') || 'Pin')}
          >
            {note.isPinned ? <PinOff className="w-2.5 h-2.5 sm:w-4 sm:h-4" /> : <Pin className="w-2.5 h-2.5 sm:w-4 sm:h-4" />}
          </button>
          <button
            onClick={handleDelete}
            className={cn(
              "p-0.5 sm:p-1.5 rounded-full transition-colors",
              colors.bgSecondary, "text-red-400 hover:bg-red-400/20"
            )}
            title={t('delete') || 'Delete'}
          >
            <Trash2 className="w-2.5 h-2.5 sm:w-4 sm:h-4" />
          </button>
        </div>
        )}

        {/* Pin indicator */}
        {note.isPinned && (
          <Pin 
            className={cn("absolute top-0.5 sm:top-2 w-3.5 h-3.5 sm:w-5 sm:h-5", isRTL ? "left-0.5 sm:left-2" : "right-0.5 sm:right-2")}
            style={{ color: note.color }}
          />
        )}
      </CardContent>
    </Card>
  );
});

