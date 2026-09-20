import * as THREE from "three";

export interface PersonPalette {
  shirt: number;
  trousers: number;
  hair: number;
  skin: number;
}

export interface PersonRig {
  root: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  height: number;
}

export const PERSON_PALETTES: PersonPalette[] = [
  { shirt: 0x3a3d42, trousers: 0x2b2d30, hair: 0x2a2320, skin: 0xd9b48f },
  { shirt: 0xe4e0d8, trousers: 0x4a4c50, hair: 0x4b3a2c, skin: 0xc79a72 },
  { shirt: 0x6b7b8c, trousers: 0x33363a, hair: 0x1f1c1a, skin: 0xa9744f },
  { shirt: 0x8c6f5a, trousers: 0x2f3134, hair: 0x5a3b24, skin: 0xe0bd97 },
  { shirt: 0x7d8a72, trousers: 0x3d4044, hair: 0x3a2f28, skin: 0xb8845c },
  { shirt: 0xd8cfc2, trousers: 0x55585c, hair: 0x8a7a68, skin: 0xe6c6a2 },
  { shirt: 0x9a5f56, trousers: 0x34373b, hair: 0x241f1c, skin: 0xcb9d76 },
];

/**
 * Builds a small stylised humanoid with proper joint pivots so limbs can be
 * animated from the hip and shoulder rather than the centre.
 */
export function createPerson(palette: PersonPalette): PersonRig {
  const root = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({
    color: palette.skin,
    roughness: 0.78,
    metalness: 0,
  });
  const shirtMat = new THREE.MeshStandardMaterial({
    color: palette.shirt,
    roughness: 0.85,
    metalness: 0,
  });
  const trouserMat = new THREE.MeshStandardMaterial({
    color: palette.trousers,
    roughness: 0.88,
    metalness: 0,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: palette.hair,
    roughness: 0.9,
    metalness: 0,
  });

  const torso = new THREE.Group();
  torso.position.y = 0.74;
  root.add(torso);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.23), shirtMat);
  chest.position.y = 0.3;
  chest.castShadow = true;
  chest.receiveShadow = true;
  torso.add(chest);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.22), trouserMat);
  hips.position.y = -0.02;
  hips.castShadow = true;
  torso.add(hips);

  const head = new THREE.Group();
  head.position.y = 0.62;
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.24, 0.21), skinMat);
  skull.position.y = 0.11;
  skull.castShadow = true;
  head.add(skull);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.1, 0.225), hairMat);
  hair.position.y = 0.23;
  head.add(hair);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), skinMat);
  neck.position.y = -0.03;
  head.add(neck);

  const makeLeg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, 0.72, 0);
    const geo = new THREE.BoxGeometry(0.14, 0.72, 0.17);
    geo.translate(0, -0.36, 0);
    const leg = new THREE.Mesh(geo, trouserMat);
    leg.castShadow = true;
    hip.add(leg);
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.09, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x222325, roughness: 0.7 }),
    );
    shoe.position.set(0, -0.74, 0.03);
    hip.add(shoe);
    root.add(hip);
    return hip;
  };

  const makeArm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.235, 1.36, 0);
    const geo = new THREE.BoxGeometry(0.1, 0.48, 0.12);
    geo.translate(0, -0.24, 0);
    const arm = new THREE.Mesh(geo, shirtMat);
    arm.castShadow = true;
    shoulder.add(arm);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.1), skinMat);
    hand.position.y = -0.5;
    shoulder.add(hand);
    root.add(shoulder);
    return shoulder;
  };

  return {
    root,
    leftLeg: makeLeg(-1),
    rightLeg: makeLeg(1),
    leftArm: makeArm(-1),
    rightArm: makeArm(1),
    torso,
    head,
    height: 1.72,
  };
}

/** Simple, cheap walk cycle driven by a phase value in radians. */
export function animateWalk(rig: PersonRig, phase: number, amount: number): void {
  const swing = Math.sin(phase) * 0.62 * amount;
  rig.leftLeg.rotation.x = swing;
  rig.rightLeg.rotation.x = -swing;
  rig.leftArm.rotation.x = -swing * 0.75;
  rig.rightArm.rotation.x = swing * 0.75;
  rig.root.position.y = Math.abs(Math.sin(phase * 2)) * 0.028 * amount;
  rig.torso.rotation.z = Math.sin(phase) * 0.02 * amount;
}

export function restPose(rig: PersonRig): void {
  rig.leftLeg.rotation.x *= 0.85;
  rig.rightLeg.rotation.x *= 0.85;
  rig.leftArm.rotation.x *= 0.85;
  rig.rightArm.rotation.x *= 0.85;
  rig.root.position.y *= 0.8;
}
