import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';

/**
 * 头像裁剪弹窗：选择本地图片后进入裁剪流程，确认后输出 webp blob 供上传。
 * 输出尺寸 512×512（2 倍超采样），webp 质量 0.85。
 */

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function cropToBlob(file: File, area: Area): Promise<Blob> {
  const img = await loadImage(file);
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 不可用');
  const srcX = (img.naturalWidth * area.x) / 100;
  const srcY = (img.naturalHeight * area.y) / 100;
  const srcW = (img.naturalWidth * area.width) / 100;
  const srcH = (img.naturalHeight * area.height) / 100;
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, size, size);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('裁剪失败'))), 'image/webp', 0.85);
  });
}

interface Props {
  file: File;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

export default function AvatarCropper({ file, busy = false, onCancel, onConfirm }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [error, setError] = useState('');
  const [previewUrl] = useState(() => URL.createObjectURL(file));

  const handleConfirm = useCallback(async () => {
    if (!croppedArea) return;
    setError('');
    try {
      const blob = await cropToBlob(file, croppedArea);
      onConfirm(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : '裁剪失败');
    }
  }, [croppedArea, file, onConfirm]);

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="w-[360px] p-5 rounded-2xl bg-[#16163a] border border-white/15 shadow-2xl">
        <h3 className="text-base font-bold text-white mb-1" style={{ fontFamily: 'var(--font-title)' }}>
          裁剪头像
        </h3>
        <p className="text-xs text-[var(--color-text-dim)] mb-3">拖动图片调整位置，滚轮/滑块缩放</p>

        <div className="relative w-full h-64 rounded-lg overflow-hidden bg-[#0a0a1a]">
          <Cropper
            image={previewUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, area) => setCroppedArea(area)}
          />
        </div>

        <div className="flex items-center gap-3 mt-3">
          <span className="text-[10px] text-gray-500">缩放</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-purple-500"
          />
        </div>

        {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}

        <div className="flex gap-3 mt-4">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold border border-white/15 text-gray-300 hover:border-white/30 transition-colors"
          >取消</button>
          <button
            onClick={handleConfirm}
            disabled={busy || !croppedArea}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 transition-colors"
          >{busy ? '上传中...' : '确认上传'}</button>
        </div>
      </div>
    </div>
  );
}
