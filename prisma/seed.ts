/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Running TS seed script...');

  const items = [
    {
      trackId: '20jbSiX29FDX4oQxBXyUEi',
      artist: 'Ariana Grande',
      title: 'hate that i made you love me',
      previewUrl: 'https://open.spotify.com/intl-pt/track/20jbSiX29FDX4oQxBXyUEi',
      durationMs: 30000,
      source: 'placeholder',
    },
    {
      trackId: '68lbSrXDORS51pmyjZv712',
      artist: 'BTS',
      title: 'SWIM',
      previewUrl: 'https://open.spotify.com/intl-pt/track/68lbSrXDORS51pmyjZv712',
      durationMs: 30000,
      source: 'placeholder',
    },
    {
      trackId: '7yNf9YjeO5JXUE3JEBgnYc',
      artist: 'Dominic Fike',
      title: 'Babydoll',
      previewUrl: 'https://open.spotify.com/intl-pt/track/7yNf9YjeO5JXUE3JEBgnYc',
      durationMs: 30000,
      source: 'placeholder',
    },
  ];

  const id = 'dev_default_stimulus_set';

  try {
    const created = await prisma.stimulusSet.upsert({
      where: { id },
      update: {
        name: 'Dev Default Stimulus Set',
        // CORREÇÃO: Comentário para permitir 'as any' especificamente nesta linha
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: items as any,
      },
      create: {
        id,
        name: 'Dev Default Stimulus Set',
        source: 'seed',
        // CORREÇÃO: Comentário para permitir 'as any' especificamente nesta linha
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: items as any,
      },
    });

    console.log('Seed applied. StimulusSet id:', created.id);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
