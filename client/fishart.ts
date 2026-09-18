import { LinearFilter, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { fishLooks } from '../packages/shared/fishlook';
// Every species is a painting from the concept sheet, cut out into public/fish. The
// interface shows the file directly; the world wraps it in a texture for the held-up catch.
const FALLBACK = 'Acorn Anchovy';
export function fishImage(name?: string) {
  const known = name && fishLooks[name] ? name : FALLBACK;
  return `${import.meta.env.BASE_URL}fish/${known.toLowerCase().replace(/ /g, '-')}.png`;
}
const textures = new Map<string, Texture>();
let loader: TextureLoader | null = null;
export function fishTexture(name?: string) {
  const src = fishImage(name);
  let texture = textures.get(src);
  if (!texture) {
    loader ??= new TextureLoader();
    texture = loader.load(src);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    textures.set(src, texture);
  }
  return texture;
}
