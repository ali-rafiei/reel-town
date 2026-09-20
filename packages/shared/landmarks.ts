import { CONTEST_SIGN, DOG, LOOKOUT, NOTICE_BOARD, PICNIC_TABLE, PIER, ROWBOAT, RPS_PODIUM, SHOP_DOOR, SORTING_CRATES, THREADS_DOOR, TIDE_POOLS, ORCHARD, props, type Landmark } from './layout.js';
import { GARDEN } from './activities.js';
// Where each activity is started. The HUD's prompts and the server's refusals read the
// same table, so a prompt never appears where the action would be refused.
export const LANDMARKS = {
  shop: SHOP_DOOR,
  threads: THREADS_DOOR,
  contestSign: CONTEST_SIGN,
  sorting: SORTING_CRATES,
  tidepool: TIDE_POOLS,
  orchard: { x: ORCHARD.x, z: ORCHARD.z + 2.2, radius: 2.8 },
  // The lighthouse door faces the path up from the plaza.
  signals: { x: props.lighthouse.x - 1.9, z: props.lighthouse.z - 1.2, radius: 1.8 },
  buoy: { x: ROWBOAT.x - 4.4, z: ROWBOAT.z, radius: 1.6 },
  // Wide enough that arriving by the path offers the game before the seats offer a sit.
  four: { x: (PICNIC_TABLE.x1 + PICNIC_TABLE.x2) / 2, z: PICNIC_TABLE.z1, radius: 3.4 },
  rps: { x: RPS_PODIUM.x, z: RPS_PODIUM.z, radius: RPS_PODIUM.radius },
  garden: GARDEN,
  dog: DOG,
  notice: NOTICE_BOARD,
  lookout: LOOKOUT,
} satisfies Record<string, Landmark>;
export type LandmarkId = keyof typeof LANDMARKS;
export const LANDMARK_IDS = Object.keys(LANDMARKS) as LandmarkId[];
