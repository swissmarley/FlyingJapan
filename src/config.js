// Tunable constants shared across modules.

export const WORLD = {
  seed: 1903,
  size: 3600, // terrain extent in metres (square)
  waterLevel: -1.2,
  treeLine: 330, // trees thin out above this elevation (m)
  snowLine: 640,
  fogColor: 0xdfe6ea,
  fogNear: 350,
  fogFar: 2500,
};

// 1903 Wright Flyer, metres. Sources: Smithsonian NASM, wright-brothers.org
// spec sheet, Flight Safety Foundation (Dec 2003), Deters/Broughton/Selig 2004.
export const FLYER = {
  span: 12.29, // 40 ft 4 in
  chord: 1.98, // 6 ft 6 in
  gap: 1.88, // 6 ft 2 in between wings
  camber: 0.1, // 1-in-20 camber -> ~0.1 m rise on a 1.98 m chord
  anhedral: 0.25, // ~10 in tip droop
  wingArea: 47, // 510 sq ft
  length: 6.43, // 21 ft 1 in, elevator leading edge to rudder trailing edge
  elevatorSpan: 3.66, // 12 ft
  elevatorChord: 0.76, // 2.5 ft
  elevatorGap: 0.75,
  rudderHeight: 2.05, // ~6.9 ft average span
  rudderChord: 0.46, // 1.5 ft
  propDiameter: 2.59, // 102 in
  massGross: 340, // 745 lb with pilot
  enginePower: 12, // hp (Charles Taylor's 4-cylinder)
  propRpm: 348,
  engineRpm: 1025,
};

export const COURSE_GATES = [
  // x, z of each giant torii gate, in order
  [0, -270],
  [130, -540],
  [340, -720],
  [540, -520],
  [500, -230],
  [320, -20],
  [110, 170],
  [-210, 260],
  [-430, 60],
  [-350, -240],
  [-110, -140],
  [60, 120],
];
