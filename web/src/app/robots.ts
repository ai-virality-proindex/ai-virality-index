import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/auth/', '/dashboard/keys', '/dashboard/alerts'],
      },
    ],
    sitemap: 'https://aiviralityindex.com/sitemap.xml',
  }
}
