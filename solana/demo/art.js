const ICONS = {
  upload: 'M12 15V3 M7.5 7.5L12 3L16.5 7.5 M4 15V20H20V15',
  download: 'M12 3V15 M7.5 10.5L12 15L16.5 10.5 M4 16V21H20V16',
  verify: 'M12 2.5L20 6V11C20 16 16 20 12 22C8 20 4 16 4 11V6Z M8.5 11.5L11 14L15.8 9.2',
  code: 'M7.5 7L2.5 12L7.5 17 M16.5 7L21.5 12L16.5 17 M14 4L10 20',
  payment: 'M3 5.5H21V18.5H3Z M3 10H21 M6.5 15H10',
  checks: 'M3 5L5 7L8.5 3.5 M11 6H21 M3 12L5 14L8.5 10.5 M11 13H21 M3 19L5 21L8.5 17.5 M11 20H21',
  rule: 'M4 5H20 M4 12H20 M4 19H20 M8 2.5V7.5 M16 9.5V14.5 M10 16.5V21.5',
  anchor: 'M12 2L21 7L12 12L3 7Z M3 12L12 17L21 12 M3 17L12 22L21 17',
  next: 'M5 12H19 M13 6L19 12L13 18',
  close: 'M5 5L19 19 M19 5L5 19',
  check: 'M4.5 12L9.5 17L19.5 7',
  fail: 'M6 6L18 18 M18 6L6 18',
  skip: 'M5 12H19',
};

function prepareCanvas(canvas) {
  const bounds = canvas.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 3);
  if (!bounds.width || !bounds.height) return;
  canvas.width = Math.round(bounds.width * scale);
  canvas.height = Math.round(bounds.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  return { ctx, width: bounds.width, height: bounds.height };
}

export function paintIcons(root = document) {
  for (const canvas of root.querySelectorAll('canvas[data-icon]')) {
    canvas.setAttribute('aria-hidden', 'true');
    const path = ICONS[canvas.dataset.icon];
    const prepared = prepareCanvas(canvas);
    if (!prepared || !path) continue;
    const { ctx, width, height } = prepared;
    ctx.scale(width / 24, height / 24);
    ctx.lineWidth = canvas.dataset.icon === 'check' ? 2.7 : 1.75;
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.strokeStyle = getComputedStyle(canvas).color;
    ctx.stroke(new Path2D(path));
  }
}

// Layered receipt plates and their verification mark share the result's state.
export function paintSeal(state) {
  const prepared = prepareCanvas(document.getElementById('seal'));
  if (!prepared) return;
  const { ctx, width, height } = prepared;
  const fail = state === 'failed';
  const rgb = fail ? '238,184,121' : '155,236,175';
  const tint = (alpha) => 'rgba(' + rgb + ',' + alpha + ')';
  const scale = Math.min(width / 430, height / 216, 1.4);
  ctx.translate(width * 0.55, height * 0.5);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  const line = (points, color, thickness = 1, close = false) => {
    ctx.beginPath();
    points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (close) ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.stroke();
  };
  const fill = (points, color) => {
    ctx.beginPath();
    points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  const dot = (x, y, r, color) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };
  for (let x = -340; x <= 340; x += 22) {
    for (let y = -180; y < 180; y += 22) dot(x, y, 0.7, tint(0.24));
  }
  const w = 104,
    h = 44,
    d = 5;
  const base = (y, i) => {
    const points = [
      [0, y - h],
      [w, y],
      [0, y + h],
      [-w, y],
    ];
    const face = ctx.createLinearGradient(-w, y - h, w, y + h);
    face.addColorStop(0, fail ? '#49473c' : '#285648');
    face.addColorStop(1, fail ? '#484336' : '#153c32');
    fill(
      [
        [-w, y],
        [0, y + h],
        [0, y + h + d],
        [-w, y + d],
      ],
      tint(i === 0 ? 0.22 : 0.16)
    );
    fill(
      [
        [w, y],
        [0, y + h],
        [0, y + h + d],
        [w, y + d],
      ],
      tint(i === 0 ? 0.36 : 0.19)
    );
    fill(points, face);
    line(points, tint(i === 0 ? 0.95 : 0.53), i === 0 ? 1.45 : 0.85, true);
    line(
      [
        [-w, y + d],
        [0, y + h + d],
        [w, y + d],
      ],
      tint(i === 0 ? 0.69 : 0.37),
      0.7
    );
    if (i === 0) {
      line(
        [
          [0, y - h + 6],
          [w - 13, y],
          [0, y + h - 6],
          [-w + 13, y],
        ],
        tint(0.46),
        0.7,
        true
      );
      for (let j = 1; j < 7; j++) {
        const x = -w + j * 12;
        const sy = y + j * 5;
        line(
          [
            [x, sy + 2],
            [x + 4, sy + 3.7],
          ],
          tint(0.63),
          0.7
        );
      }
      const xy = (a, b) => [a * 0.77 - b * 0.77, y + a * 0.34 + b * 0.34];
      const shape = [
        [-26, -25],
        [26, -25],
        [26, 0],
        [18, 16],
        [0, 30],
        [-18, 16],
        [-26, 0],
      ].map(([a, b]) => xy(a, b));
      fill(shape, tint(0.15));
      line(shape, tint(0.98), 2.4, true);
      if (state === 'verified') line([xy(-12, 0), xy(-2, 10), xy(13, -9)], tint(1), 3.4);
      else if (fail) {
        line([xy(-9, -9), xy(9, 9)], tint(1), 2.8);
        line([xy(9, -9), xy(-9, 9)], tint(1), 2.8);
      } else line([xy(-11, 0), xy(11, 0)], tint(0.8), 2);
    }
  };
  const circuits = [
    [
      [-190, 20],
      [-154, 20],
      [-131, 7],
      [-92, 7],
    ],
    [
      [-164, -52],
      [-129, -52],
      [-92, -32],
    ],
    [
      [94, -11],
      [127, -28],
      [160, -28],
      [184, -42],
    ],
    [
      [73, 52],
      [110, 68],
      [151, 68],
    ],
    [
      [-113, 47],
      [-139, 59],
      [-164, 59],
    ],
  ];
  for (const path of circuits) {
    line(path, tint(0.42), 0.85);
    const end = path[path[0][0] < 0 ? 0 : path.length - 1];
    dot(end[0], end[1], 2.4, tint(0.85));
  }
  base(34, 3);
  base(16, 2);
  base(-2, 1);
  base(-24, 0);
}
