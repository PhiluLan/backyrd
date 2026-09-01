let pendingAuthRedirect: string | null = null;

export function setPendingAuthRedirect(url: string) {
  pendingAuthRedirect = url;
}

export function consumePendingAuthRedirect() {
  const value = pendingAuthRedirect;
  pendingAuthRedirect = null;
  return value;
}
