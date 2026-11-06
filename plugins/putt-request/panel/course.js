(function (root) {
  'use strict'
  function diamond(x, y, size) {
    return [[x, y - size], [x + size, y], [x, y + size], [x - size, y]]
  }
  function bar(x1, y1, x2, y2) {
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
  }
  const COURSE = {
    id: 'main-branch',
    name: 'Main Branch',
    holes: [
      {
        name: 'Hello World',
        par: 2,
        course: [[70, 412], [230, 412], [230, 36], [70, 36]],
        blocks: [],
        bumpers: [{ x: 150, y: 215, r: 14 }],
        sands: [],
        cup: { x: 150, y: 76 },
        tee: { x: 150, y: 378 }
      },
      {
        name: 'Rubber Duck',
        par: 2,
        course: [[150, 412], [264, 240], [150, 36], [36, 240]],
        blocks: [diamond(210, 240, 15)],
        bumpers: [{ x: 150, y: 220, r: 15 }],
        sands: [{ x: 90, y: 240, rx: 20, ry: 26 }],
        cup: { x: 150, y: 80 },
        tee: { x: 150, y: 370 }
      },
      {
        name: 'Off By One',
        par: 3,
        course: [[36, 412], [156, 412], [156, 318], [268, 252], [268, 28], [150, 28], [150, 130], [36, 196]],
        blocks: [diamond(208, 150, 15)],
        bumpers: [{ x: 150, y: 225, r: 15 }],
        sands: [{ x: 84, y: 290, rx: 30, ry: 21 }],
        cup: { x: 222, y: 66 },
        tee: { x: 96, y: 380 }
      },
      {
        name: 'Bottleneck',
        par: 3,
        course: [[60, 412], [240, 412], [264, 300], [180, 220], [264, 130], [240, 30], [60, 30], [36, 130], [120, 220], [36, 300]],
        blocks: [diamond(205, 345, 15)],
        bumpers: [{ x: 150, y: 135, r: 15 }],
        sands: [{ x: 100, y: 340, rx: 26, ry: 18 }],
        cup: { x: 150, y: 66 },
        tee: { x: 150, y: 380 }
      },
      {
        name: 'Left Join',
        par: 3,
        course: [[36, 412], [264, 412], [264, 330], [120, 330], [120, 36], [36, 36]],
        blocks: [diamond(190, 372, 13)],
        bumpers: [{ x: 78, y: 210, r: 13 }],
        sands: [{ x: 78, y: 340, rx: 22, ry: 18 }],
        cup: { x: 78, y: 72 },
        tee: { x: 232, y: 372 }
      },
      {
        name: 'Rollback',
        par: 3,
        course: [[36, 412], [124, 412], [124, 170], [176, 170], [176, 412], [264, 412], [264, 36], [36, 36]],
        blocks: [diamond(220, 230, 15)],
        bumpers: [{ x: 150, y: 100, r: 15 }],
        sands: [{ x: 80, y: 240, rx: 26, ry: 30 }],
        cup: { x: 220, y: 370 },
        tee: { x: 80, y: 380 }
      },
      {
        name: 'Merge Conflict',
        par: 3,
        course: [[90, 412], [210, 412], [210, 300], [264, 240], [210, 180], [210, 36], [90, 36], [90, 180], [36, 240], [90, 300]],
        blocks: [diamond(150, 240, 20)],
        bumpers: [{ x: 150, y: 130, r: 13 }],
        sands: [{ x: 150, y: 335, rx: 24, ry: 15 }],
        cup: { x: 150, y: 70 },
        tee: { x: 150, y: 385 }
      },
      {
        name: 'Stack Trace',
        par: 4,
        course: [[36, 412], [264, 412], [264, 320], [110, 320], [110, 250], [264, 250], [264, 36], [36, 36], [36, 120], [190, 120], [190, 180], [36, 180]],
        blocks: [diamond(230, 200, 15)],
        bumpers: [{ x: 150, y: 215, r: 15 }],
        sands: [{ x: 190, y: 366, rx: 30, ry: 20 }],
        cup: { x: 70, y: 78 },
        tee: { x: 70, y: 380 }
      },
      {
        name: 'Ship It',
        par: 4,
        course: [[36, 412], [264, 412], [264, 36], [36, 36]],
        blocks: [bar(36, 300, 210, 320), bar(90, 170, 264, 190)],
        bumpers: [{ x: 150, y: 245, r: 13 }, { x: 170, y: 95, r: 13 }],
        sands: [{ x: 215, y: 365, rx: 26, ry: 18 }],
        cup: { x: 62, y: 76 },
        tee: { x: 62, y: 372 }
      }
    ]
  }
  COURSE.par = COURSE.holes.reduce((total, hole) => total + hole.par, 0)
  root.MiniGolfCourse = COURSE
})(globalThis)
