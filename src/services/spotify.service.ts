import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type TrackMetadata = {
  trackId: string;
  previewUrl?: string | null;
  title?: string;
  artists?: string[];
  durationMs?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw?: any;
};

@Injectable()
export class SpotifyService {
  private token: { accessToken: string; expiresAt: number } | null = null;

  constructor(private prisma: PrismaService) {}

  private getClientCredentials() {
    const id = process.env.SPOTIFY_CLIENT_ID;
    const secret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!id || !secret)
      throw new Error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET');
    return { id, secret };
  }

  private async fetchAccessToken() {
    if (this.token && Date.now() < this.token.expiresAt - 60_000)
      return this.token.accessToken;

    const { id, secret } = this.getClientCredentials();
    const b = Buffer.from(`${id}:${secret}`).toString('base64');

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${b}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Spotify token request failed: ${res.status} ${txt}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const accessToken = data.access_token as string;
    const expiresIn = Number(data.expires_in) || 3600;
    this.token = { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
    return accessToken;
  }

  private async fetchTrackFromSpotify(trackId: string) {
    const token = await this.fetchAccessToken();
    // CORREÇÃO: Adicionado o '$' que faltava antes das chaves e ajustada a URL para a API oficial (se necessário, reverta para sua URL proxy)
    const res = await fetch(
      `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Spotify track request failed: ${res.status} ${txt}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();

    const meta: TrackMetadata = {
      trackId,
      previewUrl: data.preview_url ?? null,
      title: data.name,

      artists: Array.isArray(data.artists)
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.artists.map((a: any) => a.name)
        : [],
      durationMs: data.duration_ms,
      raw: data,
    };
    return meta;
  }

  /**
   * Returns track metadata, using DB cache when possible.
   * Cache TTL is controlled by SPOTIFY_CACHE_TTL_SECS (default 86400 = 24h).
   */
  async getTrackMetadata(trackId: string) {
    const ttl = Number(process.env.SPOTIFY_CACHE_TTL_SECS ?? 86400) * 1000;
    const now = Date.now();

    // try DB cache
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cached = await (this.prisma as any).trackCache.findUnique({
      where: { trackId },
    });

    if (cached) {
      const updatedAt = new Date(cached.updatedAt).getTime();
      if (now - updatedAt < ttl) {
        return { ...cached.metadata } as TrackMetadata;
      }
    }

    // fetch from Spotify
    const meta = await this.fetchTrackFromSpotify(trackId);

    // upsert into cache
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.prisma as any).trackCache.upsert({
      where: { trackId },
      update: { metadata: meta },
      create: { trackId, metadata: meta },
    });

    return meta;
  }
}
