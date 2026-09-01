import { useState } from 'react';
import type { User } from '../types';
import { charIllustration } from '../config/illustrations';

/** 根据用户头像设置返回图片 src；无头像返回 null（走默认占位） */
export function avatarSrc(user: User | null): string | null {
  if (!user) return null;
  if (user.avatarType === 'char' && user.avatarValue) {
    const id = Number(user.avatarValue);
    if (!Number.isNaN(id)) return charIllustration(id);
  }
  if (user.avatarType === 'upload' && user.avatarValue) {
    return `/api/user/avatar/${user.avatarValue}`;
  }
  return null;
}

interface UserAvatarProps {
  user: User | null;
  size?: number;
}

export default function UserAvatar({ user, size = 40 }: UserAvatarProps) {
  const src = avatarSrc(user);
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };

  // 默认：昵称首字母（游客用图标）
  const letter = user?.nickname?.trim()?.charAt(0)?.toUpperCase() || '👤';

  if (src && !failed) {
    return (
      <div
        className="rounded-full overflow-hidden bg-white/10 border border-white/15 flex-shrink-0 flex items-center justify-center"
        style={style}
      >
        <img
          src={src}
          alt="头像"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div
      className="rounded-full bg-[#7c3aed]/30 border border-white/15 flex items-center justify-center font-bold text-[#a78bfa] flex-shrink-0"
      style={{ ...style, fontSize: size * 0.42 }}
    >
      {letter}
    </div>
  );
}
