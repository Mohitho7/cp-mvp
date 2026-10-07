import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import type {
  DashboardFilters,
  DistributionCount,
  InstitutionDashboard,
  TraitAverages,
} from "./reportSchema.js";

export const PRIVACY_THRESHOLD = 5;

type Db = NodePgDatabase<typeof schema>;

function emptyTraits(): TraitAverages {
  return { technical: 0, creative: 0, people: 0, risk: 0, learning: 0 };
}

export interface DashboardCommon {
  institutionName: string;
  totalStudents: number;
  completedReports: number;
  statusCounts: { pending: number; processing: number; done: number; failed: number };
  departmentOptions: string[];
  yearOptions: string[];
  batchOptions: string[];
}

/** Pure privacy gate: report-derived charts stay hidden below threshold. */
export function isDataSuppressed(completedReports: number): boolean {
  return completedReports < PRIVACY_THRESHOLD;
}

function buildDrizzleWhere(institutionId: string, filters: DashboardFilters) {
  const conditions = [eq(schema.studentsTable.institutionId, institutionId)];
  if (filters.department) {
    conditions.push(eq(schema.studentsTable.department, filters.department));
  }
  if (filters.year) {
    conditions.push(eq(schema.studentsTable.year, filters.year));
  }
  if (filters.batch) {
    conditions.push(eq(schema.studentsTable.batch, filters.batch));
  }
  return and(...conditions);
}

function buildRawWhere(institutionId: string, filters: DashboardFilters): SQL {
  const conditions = [sql`st.institution_id = ${institutionId}`];
  if (filters.department) {
    conditions.push(sql`st.department = ${filters.department}`);
  }
  if (filters.year) {
    conditions.push(sql`st.year = ${filters.year}`);
  }
  if (filters.batch) {
    conditions.push(sql`st.batch = ${filters.batch}`);
  }
  return sql.join(conditions, sql` AND `);
}

function countRows(result: {
  rows: Array<Record<string, unknown>>;
}): DistributionCount[] {
  return result.rows.map((row) => {
    if (typeof row.label !== "string") {
      throw new Error("Dashboard query returned a non-string label.");
    }
    const count = Number(row.count);
    if (!Number.isFinite(count)) {
      throw new Error("Dashboard query returned an invalid count.");
    }
    return { label: row.label, count };
  });
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Dashboard query returned an invalid ${field}.`);
  }
  return value;
}

export async function queryDashboard(
  db: Db,
  institutionId: string,
  institutionName: string,
  filters: DashboardFilters,
): Promise<InstitutionDashboard> {
  const where = buildDrizzleWhere(institutionId, filters);
  const rawWhere = buildRawWhere(institutionId, filters);

  const [statusRows, studentCount, departmentRows, yearRows, batchRows] =
    await Promise.all([
      db
        .select({
          status: schema.careerSubmissionsTable.status,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.careerSubmissionsTable)
        .innerJoin(
          schema.studentsTable,
          eq(schema.careerSubmissionsTable.studentId, schema.studentsTable.id),
        )
        .where(where)
        .groupBy(schema.careerSubmissionsTable.status),
      db
        .select({
          count: sql<number>`count(distinct ${schema.studentsTable.id})::int`,
        })
        .from(schema.careerSubmissionsTable)
        .innerJoin(
          schema.studentsTable,
          eq(schema.careerSubmissionsTable.studentId, schema.studentsTable.id),
        )
        .where(where),
      db
        .selectDistinct({ value: schema.studentsTable.department })
        .from(schema.studentsTable)
        .where(eq(schema.studentsTable.institutionId, institutionId))
        .orderBy(asc(schema.studentsTable.department)),
      db
        .selectDistinct({ value: schema.studentsTable.year })
        .from(schema.studentsTable)
        .where(eq(schema.studentsTable.institutionId, institutionId))
        .orderBy(asc(schema.studentsTable.year)),
      db
        .selectDistinct({ value: schema.studentsTable.batch })
        .from(schema.studentsTable)
        .where(eq(schema.studentsTable.institutionId, institutionId))
        .orderBy(asc(schema.studentsTable.batch)),
    ]);

  const statusCounts = { pending: 0, processing: 0, done: 0, failed: 0 };
  for (const row of statusRows) {
    statusCounts[row.status] = Number(row.count);
  }
  const totalStudents = Number(studentCount[0]?.count ?? 0);
  const completedReports = statusCounts.done;
  const common: DashboardCommon = {
    institutionName,
    totalStudents,
    completedReports,
    statusCounts,
    departmentOptions: departmentRows.map((row) => row.value),
    yearOptions: yearRows.map((row) => row.value),
    batchOptions: batchRows.map((row) => row.value),
  };

  if (isDataSuppressed(completedReports)) {
    return {
      ...common,
      dataSuppressed: true,
      trackDistribution: [],
      clarityDistribution: [],
      workerTypeDistribution: [],
      traitAverages: emptyTraits(),
      topSkills: [],
      topCareers: [],
      entryRoles: [],
      marketBarrierDistribution: [],
      longTermCaliberDistribution: [],
      careersToAvoid: [],
      commonConflicts: [],
    };
  }

  const fromSql = sql`
    FROM career_results cr
    INNER JOIN career_submissions cs ON cs.id = cr.submission_id
    INNER JOIN career_students st ON st.id = cs.student_id
  `;

  const [
    trackResult,
    clarityResult,
    workerResult,
    skillResult,
    careerResult,
    entryRoleResult,
    barrierResult,
    caliberResult,
    avoidResult,
    conflictResult,
    averages,
  ] = await Promise.all([
    db.execute(sql<{ label: string; count: number }>`
      SELECT cr.recommended_track AS label, count(*)::int AS count
      ${fromSql}
      WHERE ${rawWhere}
      GROUP BY cr.recommended_track
      ORDER BY count DESC, label
    `),
    db.execute(sql<{ label: string; count: number }>`
      SELECT cr.clarity_level AS label, count(*)::int AS count
      ${fromSql}
      WHERE ${rawWhere}
      GROUP BY cr.clarity_level
      ORDER BY count DESC, label
    `),
    db.execute(sql<{ label: string; count: number }>`
      SELECT cr.worker_type AS label, count(*)::int AS count
      ${fromSql}
      WHERE ${rawWhere}
      GROUP BY cr.worker_type
      ORDER BY count DESC, label
    `),
    db.execute(sql<{ label: string; count: number }>`
      SELECT skill.value AS label, count(*)::int AS count
      ${fromSql}
      CROSS JOIN LATERAL jsonb_array_elements_text(
        cr.report #> '{trackDetail,skillsToLearn}'
      ) AS skill(value)
      WHERE ${rawWhere}
      GROUP BY skill.value
      ORDER BY count DESC, label
      LIMIT 8
    `),
    db.execute(sql<{ label: string; count: number }>`
      SELECT career.item ->> 'title' AS label, count(*)::int AS count
      ${fromSql}
      CROSS JOIN LATERAL jsonb_array_elements(
        cr.report -> 'careerFits'
      ) AS career(item)
      WHERE ${rawWhere}
      GROUP BY career.item ->> 'title'
      ORDER BY count DESC, label
      LIMIT 8
    `),
    db.execute(sql<{ label: string; count: number }>`
      SELECT role.value AS label, count(*)::int AS count
      ${fromSql}
      CROSS JOIN LATERAL jsonb_array_elements_text(
        cr.report #> '{caliberVsEntry,firstEntryRoles}'
      ) AS role(value)
      WHERE ${rawWhere}
      GROUP BY role.value
      ORDER BY count DESC, label
      LIMIT 8
    `),
    db.execute(sql<{ label: string; count: number }>`
      SELECT cr.report #>> '{caliberVsEntry,marketBarrierLevel}' AS label,
        count(*)::int AS count
      ${fromSql}
      WHERE ${rawWhere}
      GROUP BY cr.report #>> '{caliberVsEntry,marketBarrierLevel}'
      ORDER BY count DESC, label
    `),
    db.execute(sql<{ label: string; count: number }>`
      SELECT cr.report #>> '{caliberVsEntry,longTermCaliber}' AS label,
        count(*)::int AS count
      ${fromSql}
      WHERE ${rawWhere}
      GROUP BY cr.report #>> '{caliberVsEntry,longTermCaliber}'
      ORDER BY count DESC, label
      LIMIT 8
    `),
    db.execute(sql<{ label: string; count: number }>`
      SELECT career.item ->> 'title' AS label, count(*)::int AS count
      ${fromSql}
      CROSS JOIN LATERAL jsonb_array_elements(
        cr.report -> 'careersToAvoid'
      ) AS career(item)
      WHERE ${rawWhere}
      GROUP BY career.item ->> 'title'
      ORDER BY count DESC, label
      LIMIT 8
    `),
    db.execute(sql<{ tag: string; text: string; count: number }>`
      SELECT
        conflict.item ->> 'tag' AS tag,
        conflict.item ->> 'text' AS text,
        count(*)::int AS count
      ${fromSql}
      CROSS JOIN LATERAL jsonb_array_elements(
        cr.report #> '{answerPatterns,conflicts}'
      ) AS conflict(item)
      WHERE ${rawWhere}
      GROUP BY conflict.item ->> 'tag', conflict.item ->> 'text'
      ORDER BY count DESC, tag
      LIMIT 8
    `),
    db
      .select({
        technical: sql<number>`coalesce(avg(${schema.careerResultsTable.technicalScore}), 0)::float8`,
        creative: sql<number>`coalesce(avg(${schema.careerResultsTable.creativeScore}), 0)::float8`,
        people: sql<number>`coalesce(avg(${schema.careerResultsTable.peopleScore}), 0)::float8`,
        risk: sql<number>`coalesce(avg(${schema.careerResultsTable.riskScore}), 0)::float8`,
        learning: sql<number>`coalesce(avg(${schema.careerResultsTable.learningScore}), 0)::float8`,
      })
      .from(schema.careerResultsTable)
      .innerJoin(
        schema.careerSubmissionsTable,
        eq(
          schema.careerResultsTable.submissionId,
          schema.careerSubmissionsTable.id,
        ),
      )
      .innerJoin(
        schema.studentsTable,
        eq(schema.careerSubmissionsTable.studentId, schema.studentsTable.id),
      )
      .where(where),
  ]);

  return {
    ...common,
    dataSuppressed: false,
    trackDistribution: countRows(trackResult),
    clarityDistribution: countRows(clarityResult),
    workerTypeDistribution: countRows(workerResult),
    traitAverages: {
      technical: Number(averages[0]?.technical ?? 0),
      creative: Number(averages[0]?.creative ?? 0),
      people: Number(averages[0]?.people ?? 0),
      risk: Number(averages[0]?.risk ?? 0),
      learning: Number(averages[0]?.learning ?? 0),
    },
    topSkills: countRows(skillResult).map(({ label, count }) => ({
      skill: label,
      count,
    })),
    topCareers: countRows(careerResult),
    entryRoles: countRows(entryRoleResult),
    marketBarrierDistribution: countRows(barrierResult),
    longTermCaliberDistribution: countRows(caliberResult),
    careersToAvoid: countRows(avoidResult),
    commonConflicts: conflictResult.rows.map((row) => {
      const count = Number(row.count);
      if (!Number.isFinite(count)) {
        throw new Error("Dashboard query returned an invalid conflict count.");
      }
      return {
        tag: readRequiredString(row.tag, "conflict tag"),
        text: readRequiredString(row.text, "conflict text"),
        count,
      };
    }),
  };
}
