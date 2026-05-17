import PocketBase from 'pocketbase';

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb.dasdann.jetzt';

export const pb = new PocketBase(pbUrl);

// Synchronize client-side auth store with the cookie if we are in the browser
if (typeof window !== 'undefined') {
  // 1. Initial Load: Load cookie token & model into AuthStore if present to match middleware state
  const pbAuthCookie = document.cookie
    .split('; ')
    .find(row => row.startsWith('pb_auth='));
    
  if (pbAuthCookie) {
    try {
      const cookieValue = decodeURIComponent(pbAuthCookie.split('=')[1]);
      const parsed = JSON.parse(cookieValue);
      if (parsed.token && parsed.model) {
        pb.authStore.save(parsed.token, parsed.model);
      }
    } catch (e) {
      console.error("Error loading pb_auth cookie to AuthStore:", e);
    }
  }

  // 2. Continuous Sync: Listen to AuthStore changes and propagate them to the cookie immediately
  pb.authStore.onChange((token, model) => {
    if (token) {
      const data = JSON.stringify({ token, model });
      // Persistent 10-day cookie
      const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `pb_auth=${encodeURIComponent(data)}; path=/; max-age=864000; SameSite=Lax${secureFlag}`;
    } else {
      // Clear cookie immediately on logout
      document.cookie = "pb_auth=; path=/; max-age=0; SameSite=Lax";
    }
  });
}

// Helper for server-side Pocketbase instance (to be used in route handlers, server components)
export const createServerPB = (cookieHeader: string | undefined) => {
  const serverPb = new PocketBase(pbUrl);
  
  if (cookieHeader) {
    serverPb.authStore.loadFromCookie(cookieHeader);
  }

  return serverPb;
};
