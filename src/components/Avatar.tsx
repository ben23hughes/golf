'use client'

import Image from 'next/image'

type AvatarProps = {
  name: string
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASSES = {
  sm: 'h-9 w-9 rounded-xl text-sm',
  md: 'h-11 w-11 rounded-2xl text-sm',
  lg: 'h-16 w-16 rounded-[1.6rem] text-xl',
}

const SIZE_PIXELS = {
  sm: 36,
  md: 44,
  lg: 64,
}

export default function Avatar({ name, avatarUrl, size = 'md' }: AvatarProps) {
  const label = name.trim().charAt(0).toUpperCase() || '?'

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={SIZE_PIXELS[size]}
        height={SIZE_PIXELS[size]}
        loader={({ src }) => src}
        unoptimized
        className={`${SIZE_CLASSES[size]} bg-[#dce8df] object-cover`}
      />
    )
  }

  return (
    <div className={`flex items-center justify-center bg-[#dce8df] text-[#174c38] ${SIZE_CLASSES[size]}`}>
      <span className="font-bold">{label}</span>
    </div>
  )
}
