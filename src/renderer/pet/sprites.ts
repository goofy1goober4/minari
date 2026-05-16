import { ImageSource, Texture } from 'pixi.js';

export type SpriteName =
  | 'body'
  | 'sprout'
  | 'face_front_open'
  | 'face_front_closed'
  | 'face_front_half'
  | 'face_front_smile'
  | 'face_front_surprise'
  | 'face_front_tiltL'
  | 'face_front_tiltR';

const FILE_FOR: Record<SpriteName, string> = {
  body: '/sprites/body.png',
  sprout: '/sprites/sprout.png',
  face_front_open: '/sprites/face_front_open.png',
  face_front_closed: '/sprites/face_front_closed.png',
  face_front_half: '/sprites/face_front_half.png',
  face_front_smile: '/sprites/face_front_smile.png',
  face_front_surprise: '/sprites/face_front_surprise.png',
  face_front_tiltL: '/sprites/face_front_tiltL.png',
  face_front_tiltR: '/sprites/face_front_tiltR.png',
};

// Load through a plain HTMLImageElement rather than PixiJS Assets.load.
// Assets.load mangled the URL on the packaged build — it dropped the
// "/sprites/" path segment (requesting /body.png instead of /sprites/body.png)
// and every sprite fell back to the placeholder box. <img> resolves the URL
// straight against the document origin, so it works under both the dev http
// server and the production app:// scheme.
function loadImageEl(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
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
  const img = await loadImageEl(FILE_FOR[name]);
  if (img) {
    const texture = new Texture({ source: new ImageSource({ resource: img }) });
    return { texture, isPlaceholder: false };
  }
  // Placeholder shares Pixi's 1×1 white texture; the caller applies width/
  // height/tint on the Sprite directly, since we have no renderer reference
  // here to bake a custom RenderTexture.
  return { texture: Texture.WHITE, isPlaceholder: true, placeholder };
}
