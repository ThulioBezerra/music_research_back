import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { StimulusItem, ParticipantType } from '../types/entities';
import { PrismaService } from '../../prisma/prisma.service'; // <--- Importando o Service correto

function seededRandom(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], seed: number) {
  const rnd = seededRandom(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

@Injectable()
export class SessionService {
  // Injeção do PrismaService
  constructor(private prisma: PrismaService) {}

  async startSession(payload: {
    token?: string;
    demographics?: Record<string, unknown> | null;
    seed?: number;
  }) {
    const { token, demographics, seed } = payload || {};

    let participant: ParticipantType | null = null;
    if (token) {
      participant = (await this.prisma.participant.findUnique({
        where: { anonToken: token },
      })) as unknown as ParticipantType | null;
    }

    if (!participant) {
      const anonToken =
        token ??
        `anon_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;

      type LocalParticipantCreate = {
        anonToken: string;
        consentTimestamp: Date;
        demographics?: unknown;
      };

      const participantData: LocalParticipantCreate = {
        anonToken,
        consentTimestamp: new Date(),
      };
      if (demographics != null) participantData.demographics = demographics;

      participant = (await this.prisma.participant.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: participantData as any,
      })) as unknown as ParticipantType;
    }

    // choose seed
    const randomSeed =
      typeof seed === 'number' && Number.isInteger(seed)
        ? seed
        : Math.floor(Math.random() * 1_000_000_000);

    // pick a stimulus set (latest)
    const stimulusSet = await this.prisma.stimulusSet.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (!stimulusSet) {
      throw new Error('No stimulus_set available');
    }

    const items = (stimulusSet.items as unknown as StimulusItem[]) ?? [];

    // deterministic shuffle and apply sampling rule: max 2 tracks per artist
    const shuffled = shuffle(items, randomSeed);
    const selected: StimulusItem[] = [];
    const artistCount: Record<string, number> = {};
    for (const it of shuffled) {
      const artist = (it && it.artist) || 'unknown';
      const count = artistCount[artist] || 0;
      if (count >= 2) continue;
      selected.push(it);
      artistCount[artist] = count + 1;
    }

    // create session
    const session = await this.prisma.session.create({
      data: {
        participantId: participant.id,
        stimulusSetId: stimulusSet.id,
        randomSeed: randomSeed,
      },
    });

    // construct stimuli[] with orderIndex and previewUrl
    const stimuli = (selected || []).map((it, idx) => ({
      orderIndex: idx,
      trackId: it.trackId,
      title: it.title,
      artist: it.artist,
      previewUrl: it.previewUrl,
      durationMs: it.durationMs,
      source: it.source,
    }));

    return {
      session_id: session.id,
      anon_token: participant.anonToken,
      stimuli,
      random_seed: randomSeed,
    };
  }

  /**
   * Return reproducible stimuli for a given session id.
   * Validates ownership when anonToken is provided.
   */
  async getSessionStimuli(sessionId: string, anonToken?: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { participant: true, stimulusSet: true },
    });

    if (!session) {
      throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    if (anonToken) {
      const p = session.participant as unknown as ParticipantType | null;
      if (!p || p.anonToken !== anonToken) {
        throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stimulusSet = session.stimulusSet as any;
    if (!stimulusSet) {
      throw new HttpException(
        'Stimulus set not found for session',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const items = (stimulusSet.items as unknown as StimulusItem[]) ?? [];

    const seed =
      typeof session.randomSeed === 'number' ? session.randomSeed : null;
    if (seed == null) {
      throw new HttpException(
        'Session missing random_seed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const shuffled = shuffle(items, seed);
    const selected: StimulusItem[] = [];
    const artistCount: Record<string, number> = {};
    for (const it of shuffled) {
      const artist = (it && it.artist) || 'unknown';
      const count = artistCount[artist] || 0;
      if (count >= 2) continue;
      selected.push(it);
      artistCount[artist] = count + 1;
    }

    const stimuli = selected.map((it, idx) => ({
      orderIndex: idx,
      trackId: it.trackId,
      title: it.title,
      artist: it.artist,
      previewUrl: it.previewUrl,
      durationMs: it.durationMs,
      source: it.source,
    }));

    return {
      session_id: session.id,
      stimuli,
      random_seed: seed,
    };
  }

  /**
   * Mark session complete. Accepts optional exit_ts (epoch ms). Calculates totalSeconds.
   * Also stores the participant demographics (deferred until the survey is finalized).
   * Idempotent: if session already completed, returns current values.
   */
  async completeSession(
    sessionId: string,
    exitTsMs?: number,
    demographics?: Record<string, unknown>,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    if (demographics != null) {
      await this.prisma.participant.update({
        where: { id: session.participantId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { demographics } as any,
      });
    }

    if (session.completed) {
      return {
        session_id: session.id,
        completed: true,
        exit_ts: session.exitTs,
        total_seconds: session.totalSeconds,
      };
    }

    const exitDate = exitTsMs ? new Date(exitTsMs) : new Date();
    const entryDate = session.entryTs;
    const totalSeconds = Math.max(
      0,
      Math.round((exitDate.getTime() - entryDate.getTime()) / 1000),
    );

    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        completed: true,
        exitTs: exitDate,
        totalSeconds: totalSeconds,
      },
    });

    return {
      session_id: updated.id,
      completed: updated.completed,
      exit_ts: updated.exitTs,
      total_seconds: updated.totalSeconds,
    };
  }
}
