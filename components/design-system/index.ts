// Design System Components
export { default as StatCard } from './StatCard'
export { default as SemanticBadge } from './SemanticBadge'
export { default as ProgressBar } from './ProgressBar'
export { default as Button } from './Button'
export { default as Card } from './Card'
export { default as EmptyState } from './EmptyState'
export { default as Skeleton, ParkingCardSkeleton, StatCardSkeleton } from './Skeleton'
export { default as Toast, ToastContainer } from './Toast'

// Design tokens and utilities
export const designTokens = {
  colors: {
    background: {
      void: '#0A0A14',
      surface: '#12121F',
      card: '#181829',
      cardRaised: '#1E1E35',
      glass: 'rgba(24, 24, 41, 0.6)'
    },
    accent: {
      primary: '#6C5CE7',
      hover: '#8B7CF6',
      glow: 'rgba(108, 92, 231, 0.35)',
      dim: 'rgba(108, 92, 231, 0.12)'
    },
    status: {
      available: '#22C55E',
      limited: '#F59E0B',
      full: '#EF4444',
      upcoming: '#6C5CE7',
      cancelled: '#E5484D',
      completed: '#C7C7DA'
    },
    text: {
      primary: '#F5F5F7',
      secondary: '#9494A8',
      muted: '#6B7280'
    }
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '32px',
    '4xl': '40px'
  },
  borderRadius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '24px',
    full: '9999px'
  },
  animation: {
    fast: '150ms',
    normal: '200ms',
    slow: '300ms',
    slower: '400ms'
  }
}

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'available':
    case 'active':
      return designTokens.colors.status.available
    case 'limited':
    case 'upcoming':
      return designTokens.colors.status.limited
    case 'full':
    case 'cancelled':
      return designTokens.colors.status.full
    case 'completed':
      return designTokens.colors.status.completed
    default:
      return designTokens.colors.accent.primary
  }
}

export const getOccupancyStatus = (available: number, total: number) => {
  const percentage = (available / total) * 100
  if (percentage > 50) return 'available'
  if (percentage > 20) return 'limited'
  return 'full'
}