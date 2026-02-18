import type { MetadataRoute } from 'next'

const MODELS = ['chatgpt', 'gemini', 'claude', 'perplexity', 'deepseek', 'grok', 'copilot']

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://aiviralityindex.com'
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${base}/dashboard`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/compare`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/docs`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
  ]

  const modelPages: MetadataRoute.Sitemap = MODELS.map((slug) => ({
    url: `${base}/models/${slug}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }))

  return [...staticPages, ...modelPages]
}
