import { Track, Artist } from '../types';
import { getTrackedArtists, saveTracks, updateArtistSyncTime, initDatabase } from './db';
import { getArtistReleases } from './youtube';

export interface SyncResult {
  newTracksCount: number;
  newTracks: Track[];
  scannedArtistsCount: number;
  errors: string[];
}

export function triggerSystemNotification(title: string, body: string, icon?: string) {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification(title, { body, icon });
          }
        });
      }
    }
  } catch (err) {
    console.warn('Could not trigger desktop notification:', err);
  }
}

export async function syncSingleArtist(artist: Artist): Promise<{ newTracks: Track[]; totalReleases: number }> {
  const database = await initDatabase();
  const releases = await getArtistReleases(artist.id);
  const freshTracks: Track[] = [];

  for (const track of releases) {
    if (!track.id) continue;
    const stmt = database.prepare("SELECT 1 FROM tracks WHERE id = :id LIMIT 1;");
    stmt.bind({ ':id': track.id });
    const exists = stmt.step();
    stmt.free();

    if (!exists) {
      freshTracks.push({
        ...track,
        artist: track.artist || artist.name,
        artistId: artist.id,
        isNewRelease: true
      });
    }
  }

  if (freshTracks.length > 0) {
    await saveTracks(freshTracks, true);
    // Trigger desktop notification
    triggerSystemNotification(
      `Bài hát mới từ ${artist.name}!`,
      `Đã phát hiện: ${freshTracks[0].title}${freshTracks.length > 1 ? ` và ${freshTracks.length - 1} bài khác` : ''}`,
      freshTracks[0].thumbnail || artist.thumbnail
    );

    // Dispatch global event for in-app UI celebration
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aura:new-releases', { detail: freshTracks }));
    }
  }

  await updateArtistSyncTime(artist.id);
  return { newTracks: freshTracks, totalReleases: releases.length };
}

export async function runArtistRadarSync(onProgress?: (msg: string) => void): Promise<SyncResult> {
  const artists = await getTrackedArtists();

  const result: SyncResult = {
    newTracksCount: 0,
    newTracks: [],
    scannedArtistsCount: artists.length,
    errors: []
  };

  if (!artists.length) {
    return result;
  }

  for (let i = 0; i < artists.length; i++) {
    const artist = artists[i];
    onProgress?.(`Đang quét bài hát mới của ${artist.name} (${i + 1}/${artists.length})...`);

    try {
      const { newTracks } = await syncSingleArtist(artist);
      if (newTracks.length > 0) {
        result.newTracks.push(...newTracks);
        result.newTracksCount += newTracks.length;
      }
    } catch (err: any) {
      console.warn(`Error syncing artist ${artist.name}:`, err);
      result.errors.push(`${artist.name}: ${err.message || 'Lỗi kiểm tra'}`);
    }
  }

  onProgress?.(`Hoàn tất quét Radar! Đã phát hiện ${result.newTracksCount} bài hát mới.`);
  return result;
}
