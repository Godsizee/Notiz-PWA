import { NextResponse } from 'next/server';

// The manifest's share_target posts here, but in practice the service worker
// intercepts the request before it ever reaches the network (see the fetch
// handler in worker/index.js) — that is the only place the multipart body can
// be read and parked for the client.
//
// This handler exists purely so the edge case where no service worker is
// controlling the page degrades into a redirect instead of a 404. The shared
// files are lost in that case; there is no way to carry them across without
// the worker.
export async function POST(): Promise<NextResponse> {
  return NextResponse.redirect(new URL('/share', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'), 303);
}
