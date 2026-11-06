(function (root) {
  'use strict'
  function diamond(x, y, size) {
    return [[x, y - size], [x + size, y], [x, y + size], [x - size, y]]
  }
  function bar(x1, y1, x2, y2) {
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
  }
  const RECT = [[36, 412], [264, 412], [264, 36], [36, 36]]
  function course(id, name, holes, turf) {
    return { id, name, holes, turf: turf || {}, par: holes.reduce((total, hole) => total + hole.par, 0) }
  }
  function hole(name, par, shape) {
    return Object.assign({ name, par, blocks: [], bumpers: [], sands: [] }, shape)
  }
  const MAIN_BRANCH = course('main-branch', 'Main Branch', [
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
  ])
  const FEATURE_BRANCH = course('feature-branch', 'Feature Branch', [
    hole('Fork', 3, {
      course: [[120, 412], [180, 412], [180, 260], [264, 120], [264, 36], [200, 36], [150, 170], [100, 36], [36, 36], [36, 120], [120, 260]],
      bumpers: [{ x: 150, y: 240, r: 13 }],
      cup: { x: 230, y: 70 },
      tee: { x: 150, y: 385 }
    }),
    hole('Rebase', 3, {
      course: [[36, 412], [150, 412], [150, 300], [264, 300], [264, 36], [150, 36], [150, 150], [36, 150]],
      blocks: [diamond(207, 200, 14)],
      sands: [{ x: 93, y: 210, rx: 30, ry: 18 }],
      cup: { x: 207, y: 70 },
      tee: { x: 93, y: 380 }
    }),
    hole('Cherry Pick', 3, {
      course: [[100, 412], [200, 412], [264, 340], [264, 110], [200, 36], [100, 36], [36, 110], [36, 340]],
      blocks: [diamond(150, 225, 30)],
      bumpers: [{ x: 90, y: 140, r: 12 }, { x: 210, y: 300, r: 12 }],
      cup: { x: 150, y: 70 },
      tee: { x: 150, y: 385 }
    }),
    hole('Squash', 2, {
      course: [[36, 412], [264, 412], [170, 230], [170, 36], [130, 36], [130, 230]],
      sands: [{ x: 150, y: 330, rx: 40, ry: 18 }],
      cup: { x: 150, y: 66 },
      tee: { x: 150, y: 390 }
    }),
    hole('Stash', 3, {
      course: [[36, 412], [264, 412], [264, 36], [176, 36], [176, 330], [124, 330], [124, 36], [36, 36]],
      bumpers: [{ x: 150, y: 375, r: 13 }],
      cup: { x: 80, y: 70 },
      tee: { x: 220, y: 70 }
    }),
    hole('Detached Head', 3, {
      course: RECT,
      blocks: [bar(36, 250, 120, 266), bar(180, 250, 264, 266), bar(110, 140, 190, 156)],
      bumpers: [{ x: 150, y: 205, r: 12 }],
      cup: { x: 150, y: 80 },
      tee: { x: 150, y: 385 }
    }),
    hole('Force Push', 3, {
      course: [[36, 412], [110, 412], [264, 110], [264, 36], [190, 36], [36, 338]],
      sands: [{ x: 150, y: 225, rx: 24, ry: 18 }],
      cup: { x: 226, y: 72 },
      tee: { x: 72, y: 378 }
    }),
    hole('Code Review', 4, {
      course: [[110, 412], [190, 412], [190, 280], [264, 280], [264, 180], [190, 180], [190, 36], [110, 36], [110, 180], [36, 180], [36, 280], [110, 280]],
      blocks: [diamond(150, 230, 18)],
      bumpers: [{ x: 72, y: 230, r: 12 }],
      cup: { x: 230, y: 230 },
      tee: { x: 150, y: 385 }
    }),
    hole('Release', 4, {
      course: RECT,
      blocks: [bar(90, 310, 264, 326), bar(36, 200, 210, 216), bar(90, 100, 264, 116)],
      cup: { x: 230, y: 66 },
      tee: { x: 62, y: 380 }
    })
  ])

  const HOTFIX = course('hotfix', 'Hotfix', [
    hole('Pager', 3, {
      course: [[120, 412], [180, 412], [180, 150], [264, 150], [264, 36], [36, 36], [36, 150], [120, 150]],
      bumpers: [{ x: 150, y: 95, r: 13 }],
      cup: { x: 230, y: 80 },
      tee: { x: 150, y: 385 }
    }),
    hole('Repro', 3, {
      course: RECT,
      bumpers: [{ x: 110, y: 260, r: 12 }, { x: 190, y: 180, r: 12 }, { x: 110, y: 110, r: 12 }],
      cup: { x: 205, y: 70 },
      tee: { x: 95, y: 385 }
    }),
    hole('Bisect', 3, {
      course: RECT,
      blocks: [bar(144, 130, 156, 412)],
      sands: [{ x: 210, y: 290, rx: 28, ry: 20 }],
      cup: { x: 210, y: 360 },
      tee: { x: 90, y: 385 }
    }),
    hole('Patch', 2, {
      course: [[60, 412], [240, 412], [264, 220], [240, 36], [60, 36], [36, 220]],
      blocks: [diamond(105, 220, 16), diamond(195, 220, 16)],
      cup: { x: 150, y: 70 },
      tee: { x: 150, y: 385 }
    }),
    hole('Hot Path', 3, {
      course: [[36, 412], [264, 412], [264, 36], [180, 36], [180, 320], [36, 320]],
      sands: [{ x: 222, y: 230, rx: 22, ry: 26 }],
      cup: { x: 222, y: 72 },
      tee: { x: 72, y: 366 }
    }),
    hole('Revert', 3, {
      course: [[90, 412], [210, 412], [264, 330], [264, 120], [210, 36], [90, 36], [36, 120], [36, 330]],
      blocks: [diamond(150, 165, 16), diamond(98, 240, 14), diamond(202, 240, 14), diamond(150, 315, 14)],
      cup: { x: 150, y: 240 },
      tee: { x: 150, y: 385 }
    }),
    hole('Canary', 3, {
      course: [[36, 412], [130, 412], [264, 250], [264, 150], [170, 36], [36, 36], [36, 120], [150, 200]],
      sands: [{ x: 228, y: 200, rx: 18, ry: 24 }],
      cup: { x: 72, y: 72 },
      tee: { x: 80, y: 390 }
    }),
    hole('Postmortem', 4, {
      course: RECT,
      blocks: [bar(36, 212, 130, 228), bar(170, 212, 264, 228)],
      bumpers: [{ x: 150, y: 300, r: 14 }, { x: 150, y: 140, r: 12 }],
      cup: { x: 70, y: 70 },
      tee: { x: 230, y: 385 }
    }),
    hole('All Clear', 4, {
      course: [[150, 412], [264, 300], [264, 140], [150, 28], [36, 140], [36, 300]],
      blocks: [bar(80, 215, 220, 231)],
      bumpers: [{ x: 110, y: 130, r: 12 }, { x: 190, y: 310, r: 12 }],
      cup: { x: 150, y: 80 },
      tee: { x: 150, y: 385 }
    })
  ], { turfA: '#b5603f', turfB: '#c26c4a', turfEdge: '#874330', sandA: '#f0dca6', sandB: '#dcc387', flag: '#fff1c2' })

  root.MiniGolfCourses = [MAIN_BRANCH, FEATURE_BRANCH, HOTFIX]
})(globalThis)
