import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export interface SearchResult {
  chatId: number;
  chatTitle: string;
  projectId: number | null;
  projectTitle: string | null;
  updatedAt: string;
  headline: string;
  rank: number;
}

interface SearchResultRow {
  chat_id: number;
  chat_title: string;
  project_id: number | null;
  project_title: string | null;
  updated_at: Date;
  headline: string;
  rank: number;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = parseInt(userIdHeader, 10);

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query || query.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  const trimmedQuery = query.trim();

  try {
    // Convert search query to tsquery format for full-text search
    // Also prepare for trigram similarity matching
    const tsqueryWords = trimmedQuery
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .map((word) => word.replace(/[^\w]/g, ""))
      .filter((word) => word.length > 0)
      .join(" & ");

    const tsquery = tsqueryWords || trimmedQuery.replace(/[^\w]/g, "");

    // Weighted full-text search query
    // Weight 'A' for chat title (highest priority), Weight 'B' for message content
    // Uses ts_rank_cd for relevance ranking and ts_headline for snippet generation
    // Also includes trigram similarity for fuzzy matching on typos
    const searchQuery = `
      WITH search_matches AS (
        SELECT DISTINCT ON (cs.id)
          cs.id AS chat_id,
          cs.title AS chat_title,
          cs.project_id,
          p.title AS project_title,
          cs.updated_at,
          COALESCE(
            ts_headline(
              'english',
              COALESCE(m.content, cs.title),
              plainto_tsquery('english', $2),
              'MaxWords=25, MinWords=10, StartSel=<mark>, StopSel=</mark>, MaxFragments=1'
            ),
            LEFT(COALESCE(m.content, cs.title), 150)
          ) AS headline,
          (
            -- Weighted ranking: title matches score higher than content matches
            COALESCE(ts_rank_cd(setweight(to_tsvector('english', cs.title), 'A'), plainto_tsquery('english', $2)), 0) * 10 +
            COALESCE(ts_rank_cd(setweight(to_tsvector('english', COALESCE(m.content, '')), 'B'), plainto_tsquery('english', $2)), 0) +
            -- Add trigram similarity bonus for fuzzy matching
            GREATEST(
              similarity(cs.title, $2) * 5,
              similarity(COALESCE(m.content, ''), $2)
            )
          ) AS rank
        FROM chat_sessions cs
        LEFT JOIN messages m ON m.chat_session_id = cs.id
        LEFT JOIN projects p ON cs.project_id = p.id
        WHERE cs.user_id = $1
          AND (
            -- Full-text search match
            to_tsvector('english', cs.title) @@ plainto_tsquery('english', $2)
            OR to_tsvector('english', COALESCE(m.content, '')) @@ plainto_tsquery('english', $2)
            -- Trigram similarity match for fuzzy search (handles typos)
            OR cs.title ILIKE '%' || $2 || '%'
            OR m.content ILIKE '%' || $2 || '%'
            OR similarity(cs.title, $2) > 0.2
            OR similarity(COALESCE(m.content, ''), $2) > 0.15
          )
        ORDER BY cs.id, rank DESC
      )
      SELECT
        chat_id,
        chat_title,
        project_id,
        project_title,
        updated_at,
        headline,
        rank
      FROM search_matches
      ORDER BY rank DESC, updated_at DESC
      LIMIT 20
    `;

    const { rows } = await pool.query<SearchResultRow>(searchQuery, [userId, trimmedQuery]);

    const results: SearchResult[] = rows.map((row) => ({
      chatId: row.chat_id,
      chatTitle: row.chat_title,
      projectId: row.project_id,
      projectTitle: row.project_title,
      updatedAt: row.updated_at.toISOString(),
      headline: row.headline,
      rank: row.rank,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Search failed", details: errorMessage },
      { status: 500 }
    );
  }
}
