import { createClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import Link from "next/link"

export default async function Page() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: todos, error } = await supabase.from("todos").select()

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden p-6 sm:p-8">
        <div className="flex items-center justify-between pb-6 border-b border-slate-100">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Supabase Todos</h1>
            <p className="text-sm text-slate-500 mt-1">Queried directly via Supabase SSR Client</p>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
            Connected
          </span>
        </div>

        {error ? (
          <div className="mt-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
            Error fetching todos: {error.message}
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-slate-100">
            {todos?.map((todo: any) => (
              <li key={todo.id} className="py-3.5 flex items-center justify-between group">
                <span className="text-slate-800 font-medium text-sm sm:text-base">
                  {todo.name}
                </span>
                {todo.is_complete ? (
                  <span className="px-2.5 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                    Done
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-full border border-amber-200">
                    In Progress
                  </span>
                )}
              </li>
            ))}
            {(!todos || todos.length === 0) && (
              <li className="py-6 text-center text-slate-400 text-sm">
                No todos found in Supabase database.
              </li>
            )}
          </ul>
        )}

        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Project: trtowyvsxtwzakqngfsp</span>
          <Link href="/" className="text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
