import { redirect } from 'next/navigation'

export default async function RoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/round/${id}/leaderboard`)
}
