/**
 * Phoenix hard reset - stub for GlobalErrorBoundary.
 * Since Tabula Rasa persists state in the backend database, this reloads the app.
 */
export async function phoenixHardReset(): Promise<void> {
  window.location.reload();
}
