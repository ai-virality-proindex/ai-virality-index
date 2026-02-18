import './embed.css'

export const metadata = {
  title: 'AVI Embed Widget',
}

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="embed-body">
        {children}
      </body>
    </html>
  )
}
