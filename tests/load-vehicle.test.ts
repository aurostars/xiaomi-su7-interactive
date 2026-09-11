import { describe, expect, it } from 'vitest';
import {
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Texture,
} from 'three';
import { createLoadedVehicle } from '../src/scene/load-vehicle';

describe('LoadedVehicle lifecycle', () => {
  it('removes the vehicle and disposes shared GPU resources exactly once', () => {
    const parent = new Scene();
    const root = new Group();
    const geometry = new BufferGeometry();
    const texture = new Texture();
    const sharedMaterial = new MeshStandardMaterial({ map: texture });
    const secondMaterial = new MeshStandardMaterial({ emissiveMap: texture });
    const disposeCounts = {
      geometry: 0,
      texture: 0,
      sharedMaterial: 0,
      secondMaterial: 0,
    };
    geometry.addEventListener('dispose', () => disposeCounts.geometry += 1);
    texture.addEventListener('dispose', () => disposeCounts.texture += 1);
    sharedMaterial.addEventListener('dispose', () => disposeCounts.sharedMaterial += 1);
    secondMaterial.addEventListener('dispose', () => disposeCounts.secondMaterial += 1);

    root.add(
      new Mesh(geometry, sharedMaterial),
      new Mesh(geometry, [sharedMaterial, secondMaterial]),
    );
    parent.add(root);
    const vehicle = createLoadedVehicle(root);

    vehicle.dispose();
    vehicle.dispose();

    expect(root.parent).toBeNull();
    expect(parent.children).not.toContain(root);
    expect(disposeCounts).toEqual({
      geometry: 1,
      texture: 1,
      sharedMaterial: 1,
      secondMaterial: 1,
    });
  });
});
