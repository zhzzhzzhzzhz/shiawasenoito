import type { ApiResponse, GameMode, GameRole, AiDifficulty } from '../types';

const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  return res.json();
}

export async function createRoom(
  mode: GameMode,
  role: GameRole,
  aiDifficulty: AiDifficulty = 'normal'
) {
  return request<{ roomId: string; myRole: GameRole; state: any }>('/room/create', {
    method: 'POST',
    body: JSON.stringify({ mode, role, aiDifficulty }),
  });
}

export async function joinRoom(roomId: string) {
  return request<{ roomId: string; role: GameRole }>('/room/join', {
    method: 'POST',
    body: JSON.stringify({ roomId }),
  });
}

export async function leaveRoom() {
  return request('/room/leave', { method: 'POST' });
}

export async function getRoom(roomId: string) {
  return request(`/room/${roomId}`);
}
