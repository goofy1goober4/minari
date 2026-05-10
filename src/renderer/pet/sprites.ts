import { Assets, Texture } from 'pixi.js';

export type SpriteName =
  | 'body'
  | 'sprout'
  | 'face_front_open'
  | 'face_front_closed'
  | 'face_34left_open'
  | 'face_34left_closed'
  | 'face_34right_open'
  | 'face_34right_closed';

const FILE_FOR: Record<SpriteName, string> = {
  body: '/sprites/body.png',
  sprout: '/sprites/sprout.png',
  face_front_open: '/sprites/face_front_open.png',
  face_front_closed: '/sprites/face_front_closed.png',
  face_34left_open: '/sprites/face_34left_open.png',
  face_34left_closed: '/sprites/face_34left_closed.png',
  face_34right_open: '/sprites/face_34right_open.png',
  face_34right_closed: '/sprites/face_34right_closed.png',
};

// Vite/electron-vite serves missing static paths as the SPA fallback HTML in
// dev, so a naive Assets.load can succeed with an empty/text texture instead
// of erroring. Probe with HEAD + content-type before committing.
async function tryFetchTexture(url: string): Promise<Texture | null> {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) return null;
    const ct = head.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const tex = await Assets.load<Texture>(url);
    return tex ?? null;
  } catch {
    return null;
  }
}

export interface PlaceholderSpec {
  tint: number;
  width: number;
  height: number;
}

export interface LoadedSprite {
  texture: Texture;
  isPlaceholder: boolean;
  placeholder?: PlaceholderSpec;
}

export async function loadSprite(
  name: SpriteName,
  placeholder: PlaceholderSpec,
): Promise<LoadedSprite> {
  const tex = await tryFetchTexture(FILE_FOR[name]);
  if (tex) return { texture: tex, isPlaceholder: false };
  // Placeholder shares Pixi's 1×1 white texture; the caller applies width/
  // height/tint on the Sprite directly, since we have no renderer reference
  // here to bake a custom RenderTexture.
  return { texture: Texture.WHITE, isPlaceholder: true, placeholder };
}
