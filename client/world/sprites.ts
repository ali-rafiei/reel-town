import { DoubleSide, LinearFilter, Mesh, MeshBasicMaterial, MeshToonMaterial, PlaneGeometry, SRGBColorSpace, TextureLoader, type Material, type Texture } from 'three';
import { art, type ArtSheet } from '../art';
import { toonGradient } from './models';
// Paintings from the art pack placed in the world as cards. The width of each card comes
// from the painting's own proportions, so nothing is stretched.
const ASPECT: Record<string, number> = {
  'world-billboards/bass-silhouette': 239 / 409,
  'world-billboards/bream-silhouette': 239 / 316,
  'world-billboards/eel-silhouette': 109 / 478,
  'world-billboards/minnow-silhouette': 198 / 478,
  'world-billboards/ray-silhouette': 239 / 318,
  'world-billboards/tuna-silhouette': 227 / 478,
  'world-billboards/grass-tuft': 239 / 222,
  'world-billboards/yellow-flower-tuft': 239 / 248,
  'world-billboards/pink-flower-tuft': 239 / 240,
  'world-billboards/gull-wings-up': 239 / 277,
  'world-billboards/gull-wings-down': 239 / 168,
  'world-billboards/cloud-1': 239 / 171,
  'world-billboards/cloud-2': 239 / 203,
  'world-billboards/cloud-3': 239 / 149,
  'world-billboards/heart': 239 / 207,
  'fishing-shop/chimney-smoke': 239 / 365,
  'fishing-shop/gold-sparkle': 239 / 242,
  'fishing-shop/splash-ring': 239 / 205,
  'fishing-shop/daily-pin': 239 / 303,
  'fishing-shop/shop-sign': 239 / 244,
  'fishing-shop/campfire-1': 97 / 167,
  'fishing-shop/campfire-2': 124 / 254,
};
const textures = new Map<string, Texture>();
let loader: TextureLoader | null = null;
export function spriteTexture(sheet: ArtSheet, item: string) {
  const key = `${sheet}/${item}`;
  let texture = textures.get(key);
  if (!texture) {
    loader ??= new TextureLoader();
    texture = loader.load(art(sheet, item));
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    textures.set(key, texture);
  }
  return texture;
}
export function spriteAspect(sheet: ArtSheet, item: string) {
  return ASPECT[`${sheet}/${item}`] ?? 1;
}
// A flat rectangle `height` tall in the painting's proportions, centred on its origin.
export function spriteGeometry(sheet: ArtSheet, item: string, height: number) {
  return new PlaneGeometry(height * spriteAspect(sheet, item), height);
}
// Lit cards take the scene's light and fog like the modelled props; glowing ones (fire,
// sparks) keep their painted colour whatever the hour.
export function spriteMaterial(sheet: ArtSheet, item: string, kind: 'lit' | 'glow' = 'lit', extra: Partial<{ opacity: number; transparent: boolean; depthWrite: boolean }> = {}) {
  const map = spriteTexture(sheet, item);
  const common = { map, alphaTest: 0.5, side: DoubleSide, ...extra };
  return kind === 'lit' ? new MeshToonMaterial({ ...common, gradientMap: toonGradient() }) : new MeshBasicMaterial(common);
}
export function spriteCard(sheet: ArtSheet, item: string, height: number, kind: 'lit' | 'glow' = 'lit') {
  const mesh = new Mesh(spriteGeometry(sheet, item, height), spriteMaterial(sheet, item, kind));
  mesh.castShadow = false;
  return mesh as Mesh<PlaneGeometry, Material>;
}
