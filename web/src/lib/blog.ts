import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

export interface BlogPost {
  slug: string
  title: string
  description: string
  date: string
  author: string
  tags: string[]
  readTime: number
  content: string
}

export interface BlogMeta {
  slug: string
  title: string
  description: string
  date: string
  author: string
  tags: string[]
  readTime: number
}

const CONTENT_DIR = path.join(process.cwd(), 'src', 'content', 'blog')

export function calculateReadTime(content: string): number {
  const words = content.trim().split(/\s+/).length
  return Math.max(1, Math.ceil(words / 230))
}

export function getAllPosts(): BlogMeta[] {
  if (!fs.existsSync(CONTENT_DIR)) return []

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.mdx'))

  const posts: BlogMeta[] = files.map((filename) => {
    const slug = filename.replace(/\.mdx$/, '')
    const raw = fs.readFileSync(path.join(CONTENT_DIR, filename), 'utf-8')
    const { data, content } = matter(raw)

    return {
      slug,
      title: data.title || slug,
      description: data.description || '',
      date: data.date || '',
      author: data.author || 'AVI Team',
      tags: data.tags || [],
      readTime: calculateReadTime(content),
    }
  })

  // Sort by date descending
  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function getPostBySlug(slug: string): BlogPost | null {
  const filePath = path.join(CONTENT_DIR, `${slug}.mdx`)

  if (!fs.existsSync(filePath)) return null

  const raw = fs.readFileSync(filePath, 'utf-8')
  const { data, content } = matter(raw)

  return {
    slug,
    title: data.title || slug,
    description: data.description || '',
    date: data.date || '',
    author: data.author || 'AVI Team',
    tags: data.tags || [],
    readTime: calculateReadTime(content),
    content,
  }
}

export function getAllSlugs(): string[] {
  if (!fs.existsSync(CONTENT_DIR)) return []

  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => f.replace(/\.mdx$/, ''))
}
