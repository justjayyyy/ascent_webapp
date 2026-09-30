/**
 * May this workspace member add expenses? Owners and admins always; everyone else needs `editExpenses`.
 * Members created before invitations had a status carry none, so a missing status counts as accepted.
 */
export function memberCanSubmit(member) {
  if (!member) return false;
  if (member.status !== undefined && member.status !== null && member.status !== 'accepted') return false;
  if (member.role === 'owner' || member.role === 'admin') return true;
  return member.permissions?.editExpenses === true;
}
