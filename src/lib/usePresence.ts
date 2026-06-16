import { useState, useEffect } from 'react';
import { pb } from '@/lib/pb';
import { RecordModel } from 'pocketbase';

const HEARTBEAT_MS = 10000;
const STALE_MS = 30000; // a presence record older than this is considered gone

// Lightweight presence over PocketBase realtime. Writes the current user's
// heartbeat for the open note every 10s and exposes the *other* users that
// are currently viewing the same note.
//
// NOTE: This only surfaces another person when notes are actually shared
// between accounts. With the current owner-scoped access rules each user
// only sees their own notes, so `others` will be empty until sharing exists.
export function usePresence(noteId: string | undefined) {
  const [others, setOthers] = useState<RecordModel[]>([]);

  useEffect(() => {
    if (!noteId) return;
    const user = pb.authStore.model || pb.authStore.record;
    if (!user) return;

    let recordId: string | null = null;
    let cancelled = false;

    const heartbeat = async () => {
      try {
        if (!recordId) {
          try {
            const existing = await pb
              .collection('presence')
              .getFirstListItem(`note = "${noteId}" && user = "${user.id}"`);
            recordId = existing.id;
          } catch {
            // no existing record — will create below
          }
        }

        if (recordId) {
          await pb.collection('presence').update(recordId, { last_seen: Date.now() });
        } else {
          const rec = await pb.collection('presence').create({
            note: noteId,
            user: user.id,
            last_seen: Date.now(),
          });
          if (cancelled) {
            // Component unmounted mid-create — clean the record back up.
            pb.collection('presence').delete(rec.id).catch(() => {});
          } else {
            recordId = rec.id;
          }
        }
      } catch (err) {
        console.error('Presence heartbeat failed:', err);
      }
    };

    const fetchOthers = async () => {
      try {
        const list = await pb.collection('presence').getFullList({
          filter: `note = "${noteId}" && user != "${user.id}"`,
          expand: 'user',
        });
        const now = Date.now();
        if (!cancelled) {
          setOthers(list.filter((p) => now - (p.last_seen ?? 0) < STALE_MS));
        }
      } catch (err) {
        console.error('Failed to fetch presence:', err);
      }
    };

    heartbeat();
    fetchOthers();

    const heartbeatInterval = setInterval(heartbeat, HEARTBEAT_MS);
    const refreshInterval = setInterval(fetchOthers, HEARTBEAT_MS);

    pb.collection('presence').subscribe('*', (e) => {
      if (e.record.note !== noteId) return;
      fetchOthers();
    });

    return () => {
      cancelled = true;
      clearInterval(heartbeatInterval);
      clearInterval(refreshInterval);
      pb.collection('presence').unsubscribe('*');
      if (recordId) {
        pb.collection('presence').delete(recordId).catch(() => {});
      }
    };
  }, [noteId]);

  return { others };
}
