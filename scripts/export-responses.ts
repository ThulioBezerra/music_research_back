import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.resolve(__dirname);
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'respostas.csv');

const prisma = new PrismaClient();

const COLUMN_TRANSLATIONS: Record<string, string> = {
  anon_token: 'Token anônimo',
  session_entry_ts: 'Início da sessão',
  session_exit_ts: 'Fim da sessão',
  total_seconds: 'Duração (s)',
  completed: 'Completo',
  stimulus_set_name: 'Conjunto de estímulos',

};

const DEMO_TRANSLATIONS: Record<string, string> = {
  age: 'Idade',
  musicTime: 'Tempo música',
  screenTime: 'Tempo tela',
  sex: 'Sexo',
  socialMedia: 'Redes sociais',
  institution: 'Instituição',
  education: 'Escolaridade',
  occupation: 'Ocupação',
};

const EXTRA_COLUMNS: Record<string, string> = {
  demo_city: 'Cidade',
  demo_state: 'Estado',
};

const RESPONSE_TRANSLATIONS: Record<string, string> = {
  heardBefore: 'Já ouviu antes',
  heard3Songs: 'Ouviu 3 músicas',
  heardComplete: 'Ouviu completo',
  knowArtist: 'Conhece artista',
  knowAlbum: 'Conhece álbum',
  encouragedToListenAlbum: 'Incentivado a ouvir álbum',
  stoppedToListen: 'Parou para ouvir',
  liked: 'Gostou',
  comment: 'Comentário',
};

const LIKERT_TRANSLATIONS: Record<string, string> = {
  influence: 'Influência das redes',
  friends: 'Interesse por músicas de amigos',
  viral: 'Consumo de músicas virais',
  listenedViral: 'Já ouviu música viral',
  recommended: 'Ouviu recomendação mesmo sem preferir',
  multitask: 'Escuta música fazendo outra coisa',
  discovery: 'Descoberta por recomendação',
  exclusiveTime: 'Tempo exclusivo para música',
  timeDecreased: 'Diminuiu tempo só para música',
  annoyedFast: 'Enjoa rápido de músicas virais',
  recognizePart: 'Reconhece parte viral',
  playlistsImpacted: 'Playlists impactadas por trends',
};

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str: string;
  if (typeof value === 'object') {
    str = JSON.stringify(value);
  } else {
    str = String(value);
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function discoverQuestionIds(): Promise<string[]> {
  const results = await prisma.response.groupBy({
    by: ['questionId'],
    orderBy: { questionId: 'asc' },
  });
  return results.map(r => r.questionId);
}

async function discoverDemographicsKeys(sampleSize = 200): Promise<string[]> {
  const samples = await prisma.participant.findMany({
    where: { demographics: { not: Prisma.DbNull } },
    select: { demographics: true },
    take: sampleSize,
  });

  const keys = new Set<string>();
  for (const s of samples) {
    if (s.demographics && typeof s.demographics === 'object') {
      Object.keys(s.demographics as Record<string, unknown>).forEach(k => keys.add(k));
    }
  }
  return Array.from(keys).sort();
}

function buildResponseMap(responses: Array<{ questionId: string; answer: string }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of responses) {
    map.set(r.questionId, r.answer);
  }
  return map;
}

async function main() {
  console.error('Discovering question IDs...');
  const questionIds = await discoverQuestionIds();
  console.error(`Found ${questionIds.length} unique question IDs`);

  console.error('Discovering demographics keys...');
  const demoKeys = await discoverDemographicsKeys();
  console.error(`Found ${demoKeys.length} demographics keys`);

  const ws = fs.createWriteStream(OUTPUT_FILE, { encoding: 'utf-8' });

  const demoHeaders = demoKeys
    .filter(k => k !== 'location')
    .map(k => `demo_${k}`);
  const locationIndex = demoKeys.indexOf('location');
  const cityStateColumns = ['demo_city', 'demo_state'];

  const headers = [
    'anon_token',
    'session_entry_ts',
    'session_exit_ts',
    'total_seconds',
    'completed',
    'stimulus_set_name',
    ...demoHeaders,
    ...cityStateColumns,
    ...questionIds.map(q => `resp_${q}`),
  ];
  ws.write(headers.map(escapeCsv).join(',') + '\n');

  const translations = headers.map(h => {
    if (h.startsWith('demo_')) {
      const key = h.slice(5);
      return DEMO_TRANSLATIONS[key] ?? EXTRA_COLUMNS[h] ?? key;
    }
    if (h.startsWith('resp_')) {
      const afterPrefix = h.slice(5);
      const parts = afterPrefix.split('_');
      if (parts[0] === 'track' && parts.length >= 3) {
        const trackNum = Number(parts[1]) + 1;
        const suffix = parts.slice(2).join('_');
        const questionLabel = RESPONSE_TRANSLATIONS[suffix] ?? suffix;
        return `Faixa ${trackNum} - ${questionLabel}`;
      }
      if (parts[0] === 'likert' && parts.length >= 2) {
        const key = parts.slice(1).join('_');
        return LIKERT_TRANSLATIONS[key] ?? key;
      }
      return afterPrefix;
    }
    return COLUMN_TRANSLATIONS[h] ?? h;
  });
  ws.write(translations.map(escapeCsv).join(',') + '\n');

  const pageSize = 500;
  let cursor: string | undefined;
  let hasMore = true;
  let totalExported = 0;

  while (hasMore) {
    const sessions = await prisma.session.findMany({
      take: pageSize + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      include: {
        participant: true,
        stimulusSet: true,
        responses: true,
      },
    });

    if (sessions.length === 0) break;

    hasMore = sessions.length > pageSize;
    if (hasMore) {
      cursor = sessions[pageSize - 1].id;
      sessions.pop();
    }

    for (const session of sessions) {
      const demo = session.participant.demographics as Record<string, unknown> | null;
      const respMap = buildResponseMap(session.responses);
      const row: string[] = [
        session.participant.anonToken,
        session.entryTs.toISOString(),
        session.exitTs?.toISOString() ?? '',
        session.totalSeconds != null ? String(session.totalSeconds) : '',
        session.completed ? 'true' : 'false',
        session.stimulusSet?.name ?? '',
        ...demoKeys.filter(k => k !== 'location').map(k => {
          const val = demo?.[k];
          if (val == null) return '';
          if (typeof val === 'object') return JSON.stringify(val);
          return String(val);
        }),
        ...(() => {
          const loc = typeof demo?.location === 'string' ? demo.location : '';
          const parts = loc.split('/');
          return [parts[0]?.trim() ?? '', parts[1]?.trim() ?? ''];
        })(),
        ...questionIds.map(q => respMap.get(q) ?? ''),
      ];

      ws.write(row.map(escapeCsv).join(',') + '\n');
      totalExported++;
    }

    console.error(`Exported ${totalExported} sessions so far...`);
  }

  ws.end();
  console.error(`Done! Exported ${totalExported} sessions to ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
