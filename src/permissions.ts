const permissionLabels = new Map([
  ['offline_access', 'Refresh access while you are away.'],
  ['books:read', 'Read your books, download files and check delivery status.'],
  ['books:write', 'Create books and import images.'],
  ['books:send', 'List your saved Kindle address labels and send documents to a selected address.'],
]);

export function permissionLabel(scope: string): string {
  return permissionLabels.get(scope) ?? scope;
}
