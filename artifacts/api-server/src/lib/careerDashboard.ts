import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import {
  careerResultsTable,
  careerSubmissionsTable,
  db,
  studentsTable,
} from "@workspace/db";
import type { InstitutionDashboard } from "@workspace/api-zod";

const PRIVACY_THRESHOLD = 5;

export interface CareerDashboardFilters {
  department?: string;
  year?: string;
  batch?: string;
}

function buildDrizzleWhere(
  institutionId: string,
  filters: CareerDashboardFilters,
) {
  const conditions = [eq(studentsTable.institutionId, institutionId)];
  if (filters.department) {
    conditions.push(eq(studentsTable.department, filters.department));
  }
  if (filters.year) {
    conditions.push(eq(studentsTable.year, filters.year));
  }
  if (filters.batch) {
    conditions.push(eq(studentsTable.batch, filters.batch));
  }
  return and(...conditions);
}

function buildRawWhere(
  institutionId: string,
  filters: CareerDashboardFilters,
): SQL {
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

function countRows(
  result: { rows: Array<{ label: string; count: number }> },
): Array<{ label: string; count: number }> {
  return result.rows.map((row) => ({
    label: row.label,
    count: Number(row.count),
  }));
}

function emptyTraits() {
  return {
    technical: 0,
    creative: 0,
    people: 0,
    risk: 0,
    learning: 0,
  };
}

export async function getCareerDashboard(
  institutionId: string,
  institutionName: string,
  filters: CareerDashboardFilters,
): Promise<InstitutionDashboard> {
  const where = buildDrizzleWhere(institutionId, filters);
  const rawWhere = buildRawWhere(institutionId, filters);

  const [statusRows, studentCount, departmentRows, yearRows, batchRows] =
    await Promise.all([
      db
        .select({
          status: careerSubmissionsTable.status,
          count: sql<number>`count(*)::int`,
        })
        .from(careerSubmissionsTable)
        .innerJoin(
          studentsTable,
          eq(careerSubmissionsTable.studentId, studentsTable.id),
        )
        .where(where)
        .groupBy(careerSubmissionsTable.status),
      db
        .select({ count: sql<number>`count(distinct ${studentsTable.id})::int` })
        .from(careerSubmissionsTable)
        .innerJoin(
          studentsTable,
          eq(careerSubmissionsTable.studentId, studentsTable.id),
        )
        .where(where),
      db
        .selectDistinct({ value: studentsTable.department })
        .from(studentsTable)
        .where(eq(studentsTable.institutionId, institutionId))
        .orderBy(asc(studentsTable.department)),
      db
        .selectDistinct({ value: studentsTable.year })
        .from(studentsTable)
        .where(eq(studentsTable.institutionId, institutionId))
        .orderBy(asc(studentsTable.year)),
      db
        .selectDistinct({ value: studentsTable.batch })
        .from(studentsTable)
        .where(eq(studentsTable.institutionId, institutionId))
        .orderBy(asc(studentsTable.batch)),
    ]);

  const statusCounts = {
    pending: 0,
    processing: 0,
    done: 0,
    failed: 0,
  };
  for (const row of statusRows) {
    statusCounts[row.status] = Number(row.count);
  }
  const totalStudents = Number(studentCount[0]?.count ?? 0);
  const completedReports = statusCounts.done;
  const common = {
    institutionName,
    totalStudents,
    completedReports,
    statusCounts,
    departmentOptions: departmentRows.map((row) => row.value),
    yearOptions: yearRows.map((row) => row.value),
    batchOptions: batchRows.map((row) => row.value),
  };

  if (completedReports < PRIVACY_THRESHOLD) {
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
        technical:
          sql<number>`coalesce(avg(${careerResultsTable.technicalScore}), 0)::float8`,
        creative:
          sql<number>`coalesce(avg(${careerResultsTable.creativeScore}), 0)::float8`,
        people:
          sql<number>`coalesce(avg(${careerResultsTable.peopleScore}), 0)::float8`,
        risk:
          sql<number>`coalesce(avg(${careerResultsTable.riskScore}), 0)::float8`,
        learning:
          sql<number>`coalesce(avg(${careerResultsTable.learningScore}), 0)::float8`,
      })
      .from(careerResultsTable)
      .innerJoin(
        careerSubmissionsTable,
        eq(careerResultsTable.submissionId, careerSubmissionsTable.id),
      )
      .innerJoin(
        studentsTable,
        eq(careerSubmissionsTable.studentId, studentsTable.id),
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
    careersToAvoid: countRows(avoidResult),
    commonConflicts: conflictResult.rows.map((row) => ({
      tag: row.tag,
      text: row.text,
      count: Number(row.count),
    })),
  };
}
