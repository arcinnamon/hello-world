import { getGreetings } from "@/lib/greetings";

// Rendered per request so the build needs no database credentials.
export const dynamic = "force-dynamic";

export default async function Home() {
  const { greetings, error } = await getGreetings();
  return <main><div className="card"><p>Next.js · Supabase · Vercel</p><h1>bonjour</h1>
    <p>Your agent-ready application is running. See the <code>README.md</code> to connect Supabase, Vercel and GitHub Copilot.</p>
    <h2>Greetings from the database</h2>
    {error ? <p>Greetings unavailable.</p>
      : greetings.length === 0 ? <p>No greetings yet.</p>
      : <ul>{greetings.map((g) => <li key={g.id}>{g.message}</li>)}</ul>}
    <p><a href="/api/health">View health check</a></p></div></main>;
}
