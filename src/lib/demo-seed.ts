import { writeBatch, doc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import type { Company, CompanyRole } from './types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

type WriteOp = { col: string; id: string; data: Record<string, unknown> }

async function commit(firestore: Firestore, ops: WriteOp[]) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(firestore)
    for (const op of ops.slice(i, i + 450)) {
      batch.set(doc(firestore, op.col, op.id), op.data, { merge: true })
    }
    await batch.commit()
  }
}

const MONTHS = [
  '2025-05','2025-06','2025-07','2025-08','2025-09','2025-10',
  '2025-11','2025-12','2026-01','2026-02','2026-03','2026-04',
]

// ─── Biotech seed ─────────────────────────────────────────────────────────────

function buildBiotechOps(company: Company, now: string): WriteOp[] {
  const ops: WriteOp[] = []
  const members = company.members as Record<string, CompanyRole>
  const BUDGET = 'Annual Budget'

  type ProgramDef = {
    id: string; name: string; indication: string; stage: string
    rd: number[]; ct: number[]; sga: number[]; rev: number[]
    rdB: number[]; ctB: number[]; sgaB: number[]; revB: number[]
    capexBudget: number; capexDeployed: number
    peakSales: number; pos: number; readout: string; notes: string
  }

  const programs: ProgramDef[] = [
    {
      id: `demo-${company.id}-bxt001`,
      name: 'BXT-001', indication: 'NSCLC', stage: 'Phase 2',
      //                 Jan   Feb   Mar   Apr   May   Jun   Jul   Aug   Sep   Oct   Nov   Dec
      rd:  [  920,  940,  960,  985, 1010, 1040, 1065, 1090, 1120, 1145, 1170, 1200],
      ct:  [  590,  600,  615,  635,  660,  695,  715,  740,  775,  800,  830,  855],
      sga: [  148,  150,  152,  155,  157,  160,  162,  165,  167,  170,  172,  175],
      rev: [    0,    0, 1500,    0,    0,    0,    0,    0,  750,    0,    0,    0],
      // Budget: R&D under-estimated, revenue over-estimated (classic biotech)
      rdB:  [ 780,  795,  810,  835,  855,  880,  900,  920,  945,  970,  990, 1015],
      ctB:  [ 520,  530,  545,  560,  583,  614,  631,  653,  683,  705,  731,  754],
      sgaB: [ 150,  152,  154,  157,  159,  162,  164,  167,  169,  172,  174,  177],
      revB: [    0,    0, 2500,    0,    0,    0,    0, 1500,    0,    0,    0,    0],
      capexBudget: 18_000_000, capexDeployed: 12_500_000,
      peakSales: 850_000_000, pos: 32,
      readout: '2026-09-30',
      notes: 'Phase 2a readout expected Q3 2026. CRO: Covance. 12 active sites across US and EU. Enrollment complete.',
    },
    {
      id: `demo-${company.id}-bxt002`,
      name: 'BXT-002', indication: 'Type 2 Diabetes', stage: 'Phase 1',
      rd:  [  490,  498,  507,  516,  525,  534,  543,  552,  561,  570,  580,  590],
      ct:  [  185,  190,  197,  204,  212,  220,  228,  236,  245,  254,  263,  272],
      sga: [   78,   80,   82,   84,   86,   88,   90,   92,   94,   96,   98,  100],
      rev: [    0,    0,    0,    0,    0,  500,    0,    0,    0,    0,    0,    0],
      rdB:  [ 490,  498,  507,  516,  525,  534,  543,  552,  561,  570,  580,  590],
      ctB:  [ 170,  175,  181,  188,  195,  202,  210,  217,  225,  234,  242,  250],
      sgaB: [  80,   82,   84,   86,   88,   90,   92,   94,   96,   98,  100,  102],
      revB: [    0,    0,    0,    0,    0,  750,    0,    0,    0,    0,    0,    0],
      capexBudget: 8_000_000, capexDeployed: 3_200_000,
      peakSales: 400_000_000, pos: 18,
      readout: '2027-03-31',
      notes: 'Phase 1b dose escalation in progress. 3 cohorts enrolled. FDA Fast Track designation received.',
    },
    {
      id: `demo-${company.id}-bxt003`,
      name: 'BXT-003', indication: 'Rare Disease (Orphan)', stage: 'Preclinical',
      rd:  [  205,  210,  215,  218,  222,  226,  230,  235,  238,  242,  247,  252],
      ct:  [    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0],
      sga: [   32,   33,   34,   34,   35,   35,   36,   37,   37,   38,   39,   40],
      rev: [    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0],
      rdB:  [ 200,  205,  210,  213,  217,  221,  225,  230,  233,  237,  242,  247],
      ctB:  [   0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0],
      sgaB: [  33,   34,   35,   35,   36,   36,   37,   38,   38,   39,   40,   41],
      revB: [    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0],
      capexBudget: 3_000_000, capexDeployed: 850_000,
      peakSales: 1_200_000_000, pos: 8,
      readout: '2028-06-30',
      notes: 'IND filing targeted Q4 2026. Orphan Drug designation application submitted. High unmet need indication.',
    },
  ]

  const rec = (locId: string, locName: string, period: string, metric: string, value: number) => {
    const id = `demo-${company.id}-${locId}-${period}-${slug(metric)}`
    ops.push({ col: 'financial_records', id, data: { id, locationId: locId, locationName: locName, period, metric, value: value * 1_000, companyMembers: members, createdAt: now } })
  }

  const plan = (locId: string, locName: string, period: string, metric: string, value: number) => {
    const id = `demo-${company.id}-${locId}-${period}-${slug(metric)}-${slug(BUDGET)}`
    ops.push({ col: 'financial_plans', id, data: { id, companyId: company.id, locationId: locId, locationName: locName, period, metric, plannedValue: value * 1_000, version: BUDGET, companyMembers: members, createdAt: now, updatedAt: now } })
  }

  for (const p of programs) {
    const locName = `${p.name} (${p.indication})`
    for (let m = 0; m < 12; m++) {
      const period = MONTHS[m]
      const opIncome = p.rev[m] - p.rd[m] - p.ct[m] - p.sga[m]
      const opIncomeBudget = p.revB[m] - p.rdB[m] - p.ctB[m] - p.sgaB[m]

      rec(p.id, locName, period, 'R&D Expense', p.rd[m])
      if (p.ct[m] > 0) rec(p.id, locName, period, 'Clinical Trial Costs', p.ct[m])
      rec(p.id, locName, period, 'SG&A Expense', p.sga[m])
      if (p.rev[m] > 0) rec(p.id, locName, period, 'Revenue', p.rev[m])
      rec(p.id, locName, period, 'Operating Income', opIncome)

      plan(p.id, locName, period, 'R&D Expense', p.rdB[m])
      if (p.ctB[m] > 0) plan(p.id, locName, period, 'Clinical Trial Costs', p.ctB[m])
      plan(p.id, locName, period, 'SG&A Expense', p.sgaB[m])
      if (p.revB[m] > 0) plan(p.id, locName, period, 'Revenue', p.revB[m])
      plan(p.id, locName, period, 'Operating Income', opIncomeBudget)
    }

    // Pipeline unit
    ops.push({
      col: 'unit_pipeline', id: p.id,
      data: { id: p.id, companyId: company.id, unitName: p.name, market: p.indication, stage: p.stage, expectedOpenDate: p.readout, capexBudget: p.capexBudget, capexDeployed: p.capexDeployed, auvUnderwrite: p.peakSales, ebitdaTargetPct: p.pos, notes: p.notes, companyMembers: members, createdAt: now, updatedAt: now },
    })
  }

  // Quarterly covenant snapshots (cash is the key metric for biotech)
  const covenants = [
    { period: '2025-Q2', cash: 42_000_000, totalDebt: 15_000_000, interestExpense: 300_000, fixedCharges: 450_000 },
    { period: '2025-Q3', cash: 36_500_000, totalDebt: 15_000_000, interestExpense: 300_000, fixedCharges: 450_000 },
    { period: '2025-Q4', cash: 30_200_000, totalDebt: 15_000_000, interestExpense: 300_000, fixedCharges: 450_000 },
    { period: '2026-Q1', cash: 23_800_000, totalDebt: 15_000_000, interestExpense: 300_000, fixedCharges: 450_000 },
  ]
  for (const c of covenants) {
    const id = `${company.id}_${c.period}`
    ops.push({ col: 'covenant_snapshots', id, data: { id, companyId: company.id, ...c, companyMembers: members, createdAt: now, updatedAt: now } })
  }

  return ops
}

// ─── Retail seed ──────────────────────────────────────────────────────────────

function buildRetailOps(company: Company, now: string): WriteOp[] {
  const ops: WriteOp[] = []
  const members = company.members as Record<string, CompanyRole>
  const BUDGET = 'Annual Budget'

  type LocationDef = {
    id: string; name: string
    rev: number[]   // monthly revenue in $K
    revB: number[]  // budget revenue
    cogsPct: number; laborPct: number; opexPct: number
  }

  const locs: LocationDef[] = [
    {
      id: `demo-${company.id}-chi`,
      name: 'Chicago Downtown',
      rev:  [285, 290, 312, 298, 305, 328, 318, 334, 316, 308, 295, 348],
      revB: [298, 302, 322, 308, 315, 338, 330, 345, 328, 320, 308, 360],
      cogsPct: 38, laborPct: 28, opexPct: 12,
    },
    {
      id: `demo-${company.id}-aus`,
      name: 'Austin Domain',
      rev:  [242, 248, 260, 266, 274, 282, 288, 295, 282, 276, 268, 308],
      revB: [240, 246, 258, 264, 272, 280, 286, 292, 280, 274, 266, 305],
      cogsPct: 37, laborPct: 27, opexPct: 11,  // slightly better margins
    },
    {
      id: `demo-${company.id}-nas`,
      name: 'Nashville Broadway',
      rev:  [198, 205, 214, 220, 230, 238, 245, 250, 254, 248, 240, 278],
      revB: [208, 215, 225, 230, 240, 248, 256, 262, 266, 260, 252, 290],
      cogsPct: 39, laborPct: 29, opexPct: 12,  // slight margin pressure
    },
    {
      id: `demo-${company.id}-mia`,
      name: 'Miami Brickell',  // ramping — opened May 2025
      rev:  [ 92, 108, 118, 130, 142, 152, 158, 164, 168, 164, 158, 182],
      revB: [110, 125, 138, 150, 162, 172, 178, 184, 188, 184, 178, 205],
      cogsPct: 38, laborPct: 30, opexPct: 13,  // higher labor during ramp
    },
  ]

  const rec = (locId: string, locName: string, period: string, metric: string, value: number) => {
    const id = `demo-${company.id}-${locId}-${period}-${slug(metric)}`
    ops.push({ col: 'financial_records', id, data: { id, locationId: locId, locationName: locName, period, metric, value: Math.round(value * 1_000), companyMembers: members, createdAt: now } })
  }

  const plan = (locId: string, locName: string, period: string, metric: string, value: number) => {
    const id = `demo-${company.id}-${locId}-${period}-${slug(metric)}-${slug(BUDGET)}`
    ops.push({ col: 'financial_plans', id, data: { id, companyId: company.id, locationId: locId, locationName: locName, period, metric, plannedValue: Math.round(value * 1_000), version: BUDGET, companyMembers: members, createdAt: now, updatedAt: now } })
  }

  for (const loc of locs) {
    for (let m = 0; m < 12; m++) {
      const period = MONTHS[m]
      const rev = loc.rev[m]
      const cogs = rev * (loc.cogsPct / 100)
      const labor = rev * (loc.laborPct / 100)
      const opex = rev * (loc.opexPct / 100)
      const profit = rev - cogs - labor - opex

      rec(loc.id, loc.name, period, 'Revenue', rev)
      rec(loc.id, loc.name, period, 'COGS', cogs)
      rec(loc.id, loc.name, period, 'Labor', labor)
      rec(loc.id, loc.name, period, 'Operating Expenses', opex)
      rec(loc.id, loc.name, period, 'Net Profit', profit)

      const revB = loc.revB[m]
      const cogsB = revB * (loc.cogsPct / 100)
      const laborB = revB * (loc.laborPct / 100)
      const opexB = revB * (loc.opexPct / 100)
      const profitB = revB - cogsB - laborB - opexB

      plan(loc.id, loc.name, period, 'Revenue', revB)
      plan(loc.id, loc.name, period, 'COGS', cogsB)
      plan(loc.id, loc.name, period, 'Labor', laborB)
      plan(loc.id, loc.name, period, 'Operating Expenses', opexB)
      plan(loc.id, loc.name, period, 'Net Profit', profitB)
    }
  }

  // Pipeline units
  const pipelineUnits = [
    {
      id: `demo-${company.id}-den`,
      unitName: 'Denver Cherry Creek', market: 'Denver, CO',
      stage: 'Under Construction', expectedOpenDate: '2026-07-01',
      capexBudget: 850_000, capexDeployed: 620_000,
      auvUnderwrite: 2_800_000, ebitdaTargetPct: 20,
      notes: 'GC: Summit Build Co. On track for July opening. Permits cleared. FF&E ordered.',
    },
    {
      id: `demo-${company.id}-por`,
      unitName: 'Portland Pearl District', market: 'Portland, OR',
      stage: 'Lease Executed', expectedOpenDate: '2026-11-01',
      capexBudget: 720_000, capexDeployed: 0,
      auvUnderwrite: 2_400_000, ebitdaTargetPct: 19,
      notes: '10-year lease signed. Architect engaged. GC bid process starts Q3 2026.',
    },
  ]
  for (const u of pipelineUnits) {
    ops.push({ col: 'unit_pipeline', id: u.id, data: { ...u, companyId: company.id, companyMembers: members, createdAt: now, updatedAt: now } })
  }

  // Quarterly covenant snapshots (expansion loan — leverage trending in right direction)
  const covenants = [
    { period: '2025-Q2', cash: 1_820_000, totalDebt: 7_500_000, interestExpense: 65_000, fixedCharges: 245_000 },
    { period: '2025-Q3', cash: 2_150_000, totalDebt: 7_300_000, interestExpense: 63_000, fixedCharges: 243_000 },
    { period: '2025-Q4', cash: 2_480_000, totalDebt: 7_100_000, interestExpense: 61_000, fixedCharges: 241_000 },
    { period: '2026-Q1', cash: 2_780_000, totalDebt: 6_900_000, interestExpense: 59_000, fixedCharges: 239_000 },
  ]
  for (const c of covenants) {
    const id = `${company.id}_${c.period}`
    ops.push({ col: 'covenant_snapshots', id, data: { id, companyId: company.id, ...c, companyMembers: members, createdAt: now, updatedAt: now } })
  }

  return ops
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function seedDemoData(
  firestore: Firestore,
  company: Company,
): Promise<{ seeded: number }> {
  const now = new Date().toISOString()
  const ops = company.vertical === 'biotech'
    ? buildBiotechOps(company, now)
    : buildRetailOps(company, now)

  await commit(firestore, ops)
  return { seeded: ops.length }
}
