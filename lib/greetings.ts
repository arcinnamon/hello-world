import { createClient } from "@/lib/supabase/server";

export type Greeting = { id: number; message: string };

export type GreetingsResult =
  | { greetings: Greeting[]; error: null }
  | { greetings: []; error: string };

// Never throws: a missing table or missing env vars must not take down the page.
export async function getGreetings(): Promise<GreetingsResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("greetings")
      .select("id, message")
      .order("id");
    if (error) return { greetings: [], error: error.message };
    return { greetings: data ?? [], error: null };
  } catch (e) {
    return { greetings: [], error: e instanceof Error ? e.message : "Unknown error" };
  }
}
