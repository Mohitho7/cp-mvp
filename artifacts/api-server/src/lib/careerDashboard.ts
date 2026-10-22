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

function countRows(result: {
  rows: Array<Record<string, unknown>>;
}): Array<{ label: string; count: number }> {
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

function emptyTraits() {
  return {
    technical: 0,
    creative: 0,
    people: 0,
    risk: 0,
    learning: 0,
  };
}

/**
 * Aggregates cohort metrics for the institution faculty insights dashboard.
 *
 * CAREER CLUSTERS METRIC DEFINITION:
 * - "Career Clusters" represents the number of distinct, consistently normalized
 *   broad career categories represented among eligible completed student reports.
 * - Anchored in the canonical career taxonomy (`WORK_LANE_IDS` in `careerStrategy/types.ts`):
 *     1. Engineering (e.g. Software Engineer, QA Engineer, Cloud / DevOps, Cybersecurity, Data Scientist)
 *     2. Product (e.g. Product Manager, Associate Product Manager)
 *     3. Automation (e.g. AI Automation / No-Code Solutions Specialist)
 *     4. Startup Ops (e.g. Operations Associate, Project Coordinator, Digital Marketer)
 *     5. Technical Business (e.g. Business Analyst, Data Analyst)
 *     6. Design / UI-UX (e.g. UX/UI Designer)
 *     7. Hybrid Tech-Generalist (e.g. IT Support Specialist)
 * - Multiple specific job roles within the same category map to ONE overarching cluster
 *   via `cr.recommended_track` (`career_results.recommended_track`).
 * - Privacy Invariant: When `completedReports < PRIVACY_THRESHOLD (5)`, granular
 *   distributions including `trackDistribution` are suppressed (`dataSuppressed: true`).
 */
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
        .select({
          count: sql<number>`count(distinct ${studentsTable.id})::int`,
        })
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
      CROSS JOIN LATERAL (
        SELECT jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(cr.report #> '{trackDetail,skillsToLearn}') = 'array'
               THEN cr.report #> '{trackDetail,skillsToLearn}'
               ELSE '[]'::jsonb
          END
        ) AS value
        UNION ALL
        SELECT item ->> 'skill' AS value
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(cr.report -> 'skillsGaps') = 'array'
               THEN cr.report -> 'skillsGaps'
               ELSE '[]'::jsonb
          END
        ) AS item
        UNION ALL
        SELECT skill_text AS value
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(cr.report -> 'roadmap') = 'array'
               THEN cr.report -> 'roadmap'
               ELSE '[]'::jsonb
          END
        ) AS rm,
        jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(rm -> 'skillsToLearn') = 'array'
               THEN rm -> 'skillsToLearn'
               ELSE '[]'::jsonb
          END
        ) AS skill_text
      ) AS skill
      WHERE ${rawWhere} AND skill.value IS NOT NULL AND trim(skill.value) != ''
      GROUP BY skill.value
      ORDER BY count DESC, label
      LIMIT 8
    `),
    db.execute(sql<{ label: string; count: number }>`
      SELECT career.title AS label, count(*)::int AS count
      ${fromSql}
      CROSS JOIN LATERAL (
        SELECT item ->> 'title' AS title
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(cr.report -> 'careerFits') = 'array'
               THEN cr.report -> 'careerFits'
               ELSE '[]'::jsonb
          END
        ) AS item
        UNION ALL
        SELECT item ->> 'title' AS title
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(cr.report -> 'longTermOptions') = 'array'
               THEN cr.report -> 'longTermOptions'
               ELSE '[]'::jsonb
          END
        ) AS item
      ) AS career
      WHERE ${rawWhere} AND career.title IS NOT NULL AND trim(career.title) != ''
      GROUP BY career.title
      ORDER BY count DESC, label
      LIMIT 8
    `),
    db.execute(sql<{ label: string; count: number }>`
      SELECT role.title AS label, count(*)::int AS count
      ${fromSql}
      CROSS JOIN LATERAL (
        SELECT role_text AS title
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(cr.report #> '{caliberVsEntry,firstEntryRoles}') = 'array'
               THEN cr.report #> '{caliberVsEntry,firstEntryRoles}'
               ELSE '[]'::jsonb
          END
        ) AS role_text
        UNION ALL
        SELECT item ->> 'title' AS title
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(cr.report -> 'entryOptions') = 'array'
               THEN cr.report -> 'entryOptions'
               ELSE '[]'::jsonb
          END
        ) AS item
      ) AS role
      WHERE ${rawWhere} AND role.title IS NOT NULL AND trim(role.title) != ''
      GROUP BY role.title
      ORDER BY count DESC, label
      LIMIT 8
    `),
    db.execute(sql<{ label: string; count: number }>`
      SELECT cr.report #>> '{caliberVsEntry,marketBarrierLevel}' AS label,
        count(*)::int AS count
      ${fromSql}
      WHERE ${rawWhere} AND cr.report #>> '{caliberVsEntry,marketBarrierLevel}' IS NOT NULL
      GROUP BY cr.report #>> '{caliberVsEntry,marketBarrierLevel}'
      ORDER BY count DESC, label
    `),
    db.execute(sql<{ label: string; count: number }>`
      SELECT cr.report #>> '{caliberVsEntry,longTermCaliber}' AS label,
        count(*)::int AS count
      ${fromSql}
      WHERE ${rawWhere} AND cr.report #>> '{caliberVsEntry,longTermCaliber}' IS NOT NULL
      GROUP BY cr.report #>> '{caliberVsEntry,longTermCaliber}'
      ORDER BY count DESC, label
      LIMIT 8
    `),
    db.execute(sql<{ label: string; count: number }>`
      SELECT career.item ->> 'title' AS label, count(*)::int AS count
      ${fromSql}
      CROSS JOIN LATERAL (
        SELECT item FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(cr.report -> 'careersToAvoid') = 'array'
               THEN cr.report -> 'careersToAvoid'
               ELSE '[]'::jsonb
          END
        ) AS item
      ) AS career
      WHERE ${rawWhere} AND career.item ->> 'title' IS NOT NULL AND trim(career.item ->> 'title') != ''
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
      CROSS JOIN LATERAL (
        SELECT item FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(cr.report #> '{answerPatterns,conflicts}') = 'array'
               THEN cr.report #> '{answerPatterns,conflicts}'
               ELSE '[]'::jsonb
          END
        ) AS item
      ) AS conflict
      WHERE ${rawWhere} AND conflict.item ->> 'tag' IS NOT NULL
      GROUP BY conflict.item ->> 'tag', conflict.item ->> 'text'
      ORDER BY count DESC, tag
      LIMIT 8
    `),
    db
      .select({
        technical: sql<number>`coalesce(avg(${careerResultsTable.technicalScore}), 0)::float8`,
        creative: sql<number>`coalesce(avg(${careerResultsTable.creativeScore}), 0)::float8`,
        people: sql<number>`coalesce(avg(${careerResultsTable.peopleScore}), 0)::float8`,
        risk: sql<number>`coalesce(avg(${careerResultsTable.riskScore}), 0)::float8`,
        learning: sql<number>`coalesce(avg(${careerResultsTable.learningScore}), 0)::float8`,
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
