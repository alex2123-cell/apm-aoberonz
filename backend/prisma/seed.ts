/**
 * Demo data so the feed is not empty on day one.
 *   npm run db:seed
 * Creates: 1 admin, 1 editor, 1 company admin, 8 companies, 1 device per company, ~48 posts.
 * Prints a device API key you can use with the edge agent.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';


const companies = [
  { name: 'Rift Valley Cement', slug: 'rift-valley-cement', industry: 'manufacturing', county: 'Nakuru' },
  { name: 'Olkaria Green Power', slug: 'olkaria-green-power', industry: 'energy', county: 'Nakuru' },
  { name: 'Coast Bulk Terminals', slug: 'coast-bulk-terminals', industry: 'logistics', county: 'Mombasa' },
  { name: 'Highlands Tea Growers', slug: 'highlands-tea-growers', industry: 'agriculture', county: 'Kericho' },
  { name: 'Savanna Bank', slug: 'savanna-bank', industry: 'finance', county: 'Nairobi' },
  { name: 'Lakeside Fibre Telecom', slug: 'lakeside-fibre', industry: 'telecoms', county: 'Kisumu' },
  { name: 'Turkana Basin Minerals', slug: 'turkana-basin-minerals', industry: 'mining', county: 'Turkana' },
  { name: 'Metro Build Contractors', slug: 'metro-build', industry: 'construction', county: 'Kiambu' },
];

const templates: Record<string, string[]> = {
  manufacturing: ['New packing line starts running at full speed', 'Night shift hits a record 1,200 tonnes', 'Kiln upgrade completed ahead of schedule'],
  energy: ['Well OW-915 connected to the grid', 'Turbine maintenance finished, output restored', 'New solar canopy powers the control room'],
  logistics: ['Convoy of 40 trucks leaves the terminal for Nairobi', 'Vessel berthing cleared in under two hours', 'Container yard opens a new loading bay'],
  agriculture: ['Factory receives the season\'s first green leaf deliveries', 'Drip irrigation goes live on 200 acres', 'Farmer training day draws local growers'],
  finance: ['New branch opens its doors in Westlands', 'Mobile loan product reaches 100,000 customers', 'ATM network upgrade completed'],
  telecoms: ['Fibre link to Kisumu industrial area switched on', 'New 5G site goes live near the lakeshore', 'Network crews finish storm repairs'],
  mining: ['Survey rigs begin a new drilling phase', 'Community water point handed over', 'Ore haul trucks complete safety checks'],
  construction: ['Bridge deck pour finished on Thika Road works', 'Tower crane installed at the new hospital site', 'Road section opens to traffic'],
};

async function main() {
  const pass = await bcrypt.hash('ChangeMe123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@aoberonz.local' },
    create: { email: 'admin@aoberonz.local', name: 'Platform Admin', role: 'ADMIN', passwordHash: pass },
    update: {},
  });
  await prisma.user.upsert({
    where: { email: 'editor@aoberonz.local' },
    create: { email: 'editor@aoberonz.local', name: 'Duty Editor', role: 'EDITOR', passwordHash: pass },
    update: {},
  });

  let firstKey = '';
  for (const [i, c] of companies.entries()) {
    const company = await prisma.company.upsert({
      where: { slug: c.slug },
      create: { ...c, verified: i % 3 !== 2 },
      update: {},
    });
    if (i === 0) {
      await prisma.user.upsert({
        where: { email: 'company@aoberonz.local' },
        create: { email: 'company@aoberonz.local', name: 'Company Comms', role: 'COMPANY_ADMIN', companyId: company.id, passwordHash: pass },
        update: {},
      });
    }
    const existingDevice = await prisma.device.findFirst({ where: { companyId: company.id } });
    if (!existingDevice) {
      const key = `aob_${crypto.randomBytes(24).toString('base64url')}`;
      await prisma.device.create({
        data: {
          companyId: company.id, name: `${c.name} main gate camera`, type: 'CCTV', location: c.county,
          keyPrefix: key.slice(0, 10), apiKeyHash: crypto.createHash('sha256').update(key).digest('hex'), consentRef: `DSA-2026-${100 + i}`,
        },
      });
      if (!firstKey) firstKey = key;
    }
    const existingPosts = await prisma.post.count({ where: { companyId: company.id } });
    if (existingPosts) continue;
    const lines = templates[c.industry];
    for (let n = 0; n < 6; n++) {
      const headline = lines[n % lines.length];
      const hoursAgo = Math.floor(Math.random() * 96);
      await prisma.post.create({
        data: {
          companyId: company.id,
          headline: `${c.name}: ${headline}`,
          summary: `${headline}. Captured from the ${c.name} site in ${c.county} and verified by the Aoberonz pipeline. ` +
            `This is demo content created by the seed script.`,
          industry: c.industry,
          county: c.county,
          tags: [c.industry, c.county.toLowerCase().replace(/\s/g, '')],
          mediaUrl: `https://picsum.photos/seed/${c.slug}-${n}/1080/1350`,
          mediaType: 'image',
          status: 'PUBLISHED',
          publishedAt: new Date(Date.now() - hoursAgo * 3_600_000),
          confidence: 0.8 + Math.random() * 0.2,
          likeCount: Math.floor(Math.random() * 200),
          shareCount: Math.floor(Math.random() * 40),
          saveCount: Math.floor(Math.random() * 60),
          viewCount: Math.floor(Math.random() * 3000),
        },
      });
    }
  }
  console.log('Seed complete. Logins (password ChangeMe123!): admin@aoberonz.local, editor@aoberonz.local, company@aoberonz.local');
  if (firstKey) console.log(`Demo device API key (shown once): ${firstKey}`);
  void admin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
