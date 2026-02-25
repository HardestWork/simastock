/** Seller profile badge with color coding. */
interface ProfileBadgeProps {
  profile: string;
}

const PROFILES: Record<string, { label: string; icon: string; color: string }> = {
  CLOSER: { label: 'Closer', icon: '🎯', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  SPRINTER: { label: 'Sprinter', icon: '⚡', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  RECOUVREUR: { label: 'Recouvreur', icon: '💳', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  RISQUE: { label: 'A surveiller', icon: '⚠️', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  STANDARD: { label: 'Standard', icon: '✓', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
};

export default function ProfileBadge({ profile }: ProfileBadgeProps) {
  const meta = PROFILES[profile] ?? PROFILES.STANDARD;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${meta.color}`}>
      <span>{meta.icon}</span>
      <span>Profil {meta.label}</span>
    </span>
  );
}
