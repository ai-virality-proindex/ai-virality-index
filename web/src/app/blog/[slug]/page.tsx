import { getPostBySlug, getAllSlugs } from '@/lib/blog'
import { MDXRemote } from 'next-mdx-remote/rsc'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

export const revalidate = 3600 // ISR: 1 hour

interface Props {
  params: { slug: string }
}

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getPostBySlug(params.slug)
  if (!post) return {}

  return {
    title: `${post.title} — AI Virality Index Blog`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
      tags: post.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  }
}

export default function BlogPostPage({ params }: Props) {
  const post = getPostBySlug(params.slug)

  if (!post) notFound()

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      {/* Back link */}
      <Link
        href="/blog"
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors mb-8"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to blog
      </Link>

      {/* Header */}
      <header className="mb-10">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-emerald-900/30 px-2.5 py-0.5 text-xs font-medium text-emerald-400"
            >
              {tag}
            </span>
          ))}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">{post.title}</h1>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span>{new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            <span>&middot;</span>
            <span>{post.readTime} min read</span>
            <span>&middot;</span>
            <span>{post.author}</span>
          </div>
          <ShareButtons title={post.title} />
        </div>
      </header>

      {/* Content */}
      <article className="prose prose-invert prose-emerald max-w-none prose-headings:text-white prose-p:text-slate-300 prose-a:text-emerald-400 prose-strong:text-white prose-code:text-emerald-300 prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-800 prose-pre:border prose-pre:border-avi-border prose-blockquote:border-emerald-500 prose-blockquote:text-slate-400 prose-img:rounded-xl prose-hr:border-avi-border">
        <MDXRemote source={post.content} />
      </article>

      {/* Footer CTA */}
      <div className="mt-16 rounded-xl border border-avi-border bg-avi-card p-8 text-center">
        <h3 className="text-lg font-bold text-white mb-2">Track AI virality in real-time</h3>
        <p className="text-sm text-slate-400 mb-6">
          See which AI models are trending and catch momentum shifts before the market moves.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
          >
            Open Dashboard
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-avi-border px-6 py-2.5 text-sm font-medium text-slate-300 hover:border-slate-400 transition-colors"
          >
            View Pricing
          </Link>
        </div>
      </div>
    </div>
  )
}
