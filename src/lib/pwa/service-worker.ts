/**
 * Client-Side Service Worker Lifecycle Manager.
 * Fully SSR-safe and fail-open.
 */

export function isServiceWorkerSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator
  );
}

/**
 * Registers the root LifeOS service worker (/sw.js) with scope '/'.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    registration.addEventListener("updatefound", () => {
      const installingWorker = registration.installing;
      if (installingWorker) {
        installingWorker.addEventListener("statechange", () => {
          if (
            installingWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            console.info("[PWA] New LifeOS update available.");
          }
        });
      }
    });

    return registration;
  } catch (error) {
    console.warn("[PWA] Service worker registration failed:", error);
    return null;
  }
}

/**
 * Unregisters all active service workers for this origin.
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    return false;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const results = await Promise.all(
      registrations.map((registration) => registration.unregister())
    );
    return results.some(Boolean);
  } catch (error) {
    console.warn("[PWA] Failed to unregister service worker:", error);
    return false;
  }
}

/**
 * Manually prompts the active service worker to check for updates.
 */
export async function updateServiceWorker(): Promise<void> {
  if (!isServiceWorkerSupported()) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
  } catch (error) {
    console.warn("[PWA] Service worker update check failed:", error);
  }
}
