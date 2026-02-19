import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

// Types
interface ModelSnapshot {
  name: string
  slug: string
  vi_trade: number
  vi_content: number
  delta7_trade: number | null
  delta7_content: number | null
  components: Record<string, number>
}

interface WeeklyReportData {
  weekDate: string
  models: ModelSnapshot[]
  topMover: { name: string; delta: number } | null
  avgScore: number
}

// Styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    backgroundColor: '#0F172A',
    color: '#E2E8F0',
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 30,
    borderBottom: '2px solid #334155',
    paddingBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
  },
  badge: {
    fontSize: 10,
    color: '#10B981',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 24,
    marginBottom: 12,
  },
  overviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  overviewCard: {
    width: '30%',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  overviewLabel: {
    fontSize: 9,
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  overviewValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    padding: 8,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  colModel: { width: '28%', fontSize: 10, color: '#E2E8F0' },
  colScore: { width: '18%', fontSize: 10, textAlign: 'right' },
  colDelta: { width: '18%', fontSize: 10, textAlign: 'right' },
  colContent: { width: '18%', fontSize: 10, textAlign: 'right', color: '#94A3B8' },
  colHeaderText: { fontSize: 9, color: '#94A3B8', fontWeight: 'bold', textTransform: 'uppercase' },
  positive: { color: '#10B981' },
  negative: { color: '#EF4444' },
  neutral: { color: '#94A3B8' },
  componentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  componentCard: {
    width: '31%',
    backgroundColor: '#1E293B',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  componentCode: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  componentName: {
    fontSize: 8,
    color: '#94A3B8',
    marginBottom: 4,
  },
  componentValue: {
    fontSize: 11,
    color: '#E2E8F0',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: '1px solid #334155',
    paddingTop: 10,
  },
  footerText: {
    fontSize: 8,
    color: '#64748B',
  },
  signalCard: {
    backgroundColor: '#1E293B',
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  signalType: {
    fontSize: 9,
    textTransform: 'uppercase',
    color: '#94A3B8',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  signalText: {
    fontSize: 10,
    color: '#E2E8F0',
    lineHeight: 1.4,
  },
})

const COMPONENT_MAP: Record<string, { name: string; color: string }> = {
  T: { name: 'Search Interest', color: '#10B981' },
  S: { name: 'Social Buzz', color: '#3B82F6' },
  G: { name: 'GitHub Activity', color: '#8B5CF6' },
  N: { name: 'News Coverage', color: '#F59E0B' },
  D: { name: 'Dev Adoption', color: '#EC4899' },
  M: { name: 'Mindshare', color: '#EF4444' },
}

function formatDelta(d: number | null): string {
  if (d == null) return '—'
  return (d >= 0 ? '+' : '') + d.toFixed(1)
}

function getScoreColor(v: number): string {
  if (v <= 25) return '#EF4444'
  if (v <= 50) return '#F59E0B'
  if (v <= 75) return '#EAB308'
  return '#10B981'
}

export function WeeklyReportPDF({ data }: { data: WeeklyReportData }) {
  const sorted = [...data.models].sort((a, b) => b.vi_trade - a.vi_trade)
  const topModel = sorted[0]

  // Aggregate component averages
  const componentAvgs: Record<string, number> = {}
  const componentCounts: Record<string, number> = {}
  for (const m of data.models) {
    for (const [key, val] of Object.entries(m.components || {})) {
      componentAvgs[key] = (componentAvgs[key] || 0) + val
      componentCounts[key] = (componentCounts[key] || 0) + 1
    }
  }
  for (const key of Object.keys(componentAvgs)) {
    componentAvgs[key] /= componentCounts[key] || 1
  }

  return (
    <Document>
      {/* Page 1: Overview */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>AI Virality Report</Text>
          <Text style={styles.subtitle}>Week of {data.weekDate}</Text>
          <Text style={styles.badge}>aiviralityindex.com</Text>
        </View>

        <View style={styles.overviewRow}>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>Market Average</Text>
            <Text style={[styles.overviewValue, { color: getScoreColor(data.avgScore) }]}>
              {data.avgScore.toFixed(1)}
            </Text>
          </View>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>#1 Model</Text>
            <Text style={styles.overviewValue}>{topModel?.name || '—'}</Text>
            <Text style={{ fontSize: 10, color: getScoreColor(topModel?.vi_trade || 0), marginTop: 2 }}>
              {topModel?.vi_trade?.toFixed(1) || '—'}
            </Text>
          </View>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>Top Mover</Text>
            <Text style={styles.overviewValue}>{data.topMover?.name || '—'}</Text>
            <Text style={[{ fontSize: 10, marginTop: 2 }, (data.topMover?.delta || 0) >= 0 ? styles.positive : styles.negative]}>
              {data.topMover ? formatDelta(data.topMover.delta) : '—'}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>All Models — Trading Index</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colModel, styles.colHeaderText]}>Model</Text>
            <Text style={[styles.colScore, styles.colHeaderText]}>Trading</Text>
            <Text style={[styles.colDelta, styles.colHeaderText]}>7d Change</Text>
            <Text style={[styles.colContent, styles.colHeaderText]}>Content</Text>
          </View>
          {sorted.map((m, i) => (
            <View key={i} style={[styles.tableRow, i % 2 === 0 ? { backgroundColor: '#0F172A' } : {}]}>
              <Text style={styles.colModel}>{m.name}</Text>
              <Text style={[styles.colScore, { color: getScoreColor(m.vi_trade) }]}>
                {m.vi_trade.toFixed(1)}
              </Text>
              <Text style={[styles.colDelta, m.delta7_trade != null ? (m.delta7_trade >= 0 ? styles.positive : styles.negative) : styles.neutral]}>
                {formatDelta(m.delta7_trade)}
              </Text>
              <Text style={styles.colContent}>{m.vi_content.toFixed(1)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>AI Virality Index — Weekly Report</Text>
          <Text style={styles.footerText}>Page 1 of 2</Text>
        </View>
      </Page>

      {/* Page 2: Component Breakdown */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Component Breakdown (Market Averages)</Text>

        <View style={styles.componentGrid}>
          {Object.entries(COMPONENT_MAP).map(([code, info]) => (
            <View key={code} style={styles.componentCard}>
              <Text style={[styles.componentCode, { color: info.color }]}>{code}</Text>
              <Text style={styles.componentName}>{info.name}</Text>
              <Text style={styles.componentValue}>
                {(componentAvgs[code] || 0).toFixed(1)}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Key Takeaways</Text>
        <View style={styles.signalCard}>
          <Text style={styles.signalType}>Market Overview</Text>
          <Text style={styles.signalText}>
            The average AI virality score this week is {data.avgScore.toFixed(1)}.{' '}
            {topModel ? `${topModel.name} leads with a score of ${topModel.vi_trade.toFixed(1)}. ` : ''}
            {data.topMover ? `Biggest mover: ${data.topMover.name} (${formatDelta(data.topMover.delta)} 7d).` : ''}
          </Text>
        </View>

        <View style={styles.signalCard}>
          <Text style={styles.signalType}>What to Watch</Text>
          <Text style={styles.signalText}>
            Monitor models with large positive deltas for potential momentum continuation.
            Models with declining scores may present mean-reversion opportunities.
            Check the live dashboard for real-time updates throughout the week.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>AI Virality Index — Weekly Report</Text>
          <Text style={styles.footerText}>Page 2 of 2</Text>
        </View>
      </Page>
    </Document>
  )
}
