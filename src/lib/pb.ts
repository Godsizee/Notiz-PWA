import PocketBase from 'pocketbase';

// The URL should be relative or read from environment for client-side
// For SSR, it should point to the internal pocketbase container or external URL
const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb.dasdann.jetzt';

export const pb = new PocketBase(pbUrl);

// Helper for server-side Pocketbase instance (to be used in route handlers, server components)
export const createServerPB = (cookieHeader: string | undefined) => {
  const serverPb = new PocketBase(pbUrl);
  
  if (cookieHeader) {
    serverPb.authStore.loadFromCookie(cookieHeader);
  }

  return serverPb;
};
