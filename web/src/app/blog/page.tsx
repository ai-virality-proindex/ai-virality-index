import { getAllPosts } from '@/lib/blog'
import Link from 'next/link'
import type { Metadata } from 'next'

export const revalidate = 3600 // ISR: 1 hour

export const metadata: Metadata = {
  title: 'Blog — AI Virality Index',
  description: 'Insights on AI model virality, trading signals, and content trends. Weekly analysis from the AVI team.',
}

export default function BlogPage() {
  const posts = getAllPosts()

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Blog</h1>
        <p className="mt-3 text-lg text-slate-400">
          Insights on AI model virality, trading signals, and content trends.
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-avi-border bg-avi-card p-12 text-center">
          <p className="text-slate-400 mb-2">No posts yet</p>
          <p className="text-sm text-slate-600">Check back soon for AI virality insights.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block rounded-xl border border-avi-border bg-avi-card p-6 hover:border-slate-500 transition-colors group"
            >
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-emerald-900/30 px-2.5 py-0.5 text-xs font-medium text-emerald-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <h2 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors mb-2">
                {post.title}
              </h2>
              <p className="text-sm text-slate-400 mb-4 line-clamp-2">{post.description}</p>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>{new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                <span>&middot;</span>
                <span>{post.readTime} min read</span>
                <span>&middot;</span>
                <span>{post.author}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
