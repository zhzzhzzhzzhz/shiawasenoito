import type { ApiResponse, User } from '../types';

const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  return res.json();
}

export async function register(account: string, password: string, nickname?: string) {
  return request<{ token: string; user: User }>('/user/register', {
    method: 'POST',
    body: JSON.stringify({ account, password, nickname }),
  });
}

export async function login(account: string, password: string) {
  return request<{ token: string; user: User }>('/user/login', {
    method: 'POST',
    body: JSON.stringify({ account, password }),
  });
}

export async function getProfile() {
  return request<User>('/user/profile');
}

export async function listBackgrounds() {
  return request<string[]>('/user/backgrounds');
}

export async function updateProfile(data: {
  nickname?: string;
  avatarType?: 'char' | 'upload' | null;
  avatarValue?: string | null;
  playIntro?: boolean;
  illustVersion?: 'v1' | 'v2';
  backgroundPref?: string;
}) {
  return request<User>('/user/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function changePassword(oldPassword: string, newPassword: string) {
  return request('/user/password', {
    method: 'POST',
    body: JSON.stringify({ oldPassword, newPassword }),
  });
}

export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append('file', file);
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/user/avatar/upload`, { method: 'POST', headers, body: form });
  return res.json();
}
