import { DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { disposeAvatar, makeAvatar, type AvatarModel } from './avatar';
import { ASSET_NAMES, preloadModels } from './world/models';
import type { Appearance } from '../packages/shared/appearance';
// Small turntable used by the character editor; imports only what it needs so three.js tree-shakes.
export function createPreview(host: HTMLElement, initial: Appearance) {
  const scene = new Scene(),
    camera = new PerspectiveCamera(35, 1, 0.1, 30);
  camera.position.set(0, 1.5, 4.8);
  camera.lookAt(0, 1.22, 0);
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  scene.add(new HemisphereLight(0xfff1d2, 0x547365, 3));
  const light = new DirectionalLight(0xffeed5, 2);
  light.position.set(3, 5, 5);
  scene.add(light);
  let model: AvatarModel | null = null,
    wanted: Appearance = initial,
    frame = 0,
    angle = 0;
  const show = (appearance: Appearance) => {
    if (model) disposeAvatar(model);
    model = makeAvatar(appearance);
    scene.add(model.group);
  };
  let alive = true;
  preloadModels([...ASSET_NAMES.slice(0, 9), 'cosmetics']).then(() => {
    if (alive) show(wanted);
  });
  const resize = () => {
    const w = host.clientWidth,
      h = host.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  function draw() {
    frame = requestAnimationFrame(draw);
    angle += 0.005;
    if (model) {
      model.body.rotation.y = Math.sin(angle) * 0.5;
      model.group.position.y = Math.sin(angle * 4) * 0.02;
    }
    renderer.render(scene, camera);
  }
  resize();
  draw();
  return {
    set(appearance: Appearance) {
      wanted = appearance;
      if (model) show(appearance);
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (model) disposeAvatar(model);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
